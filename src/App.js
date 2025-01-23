import React, { useState, useEffect } from "react";
import { Wallet, Lock, Unlock, Loader2, Copy, ChevronDown, Plus } from "lucide-react";
import { BrowserProvider, Contract, parseEther, formatEther } from "ethers";

const TOKEN_ADDRESS = "0xd2358dAf3b0b0208F4eAdAd6f8d9Dc554cc8d776";
const STAKING_ADDRESS = "0x9A81cDeaBd4CcF13Cb2c0EF0E87c5CACc5A51C85";
const REQUIRED_CHAIN_ID = "0xA86A";  // Avalanche C-Chain
const REQUIRED_CHAIN_NAME = "Avalanche C-Chain";
const REQUIRED_RPC_URL = "https://api.avax.network/ext/bc/C/rpc";

const formatTime = (seconds) => {
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  return `${days}일 ${hours}시간 ${minutes}분`;
};

const App = () => {
  const [showDetails, setShowDetails] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [account, setAccount] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState({
    wallet: false,
    stake: false,
    unstake: false,
    reward: false
  });
  const [tokenBalance, setTokenBalance] = useState("0");
  const [stakedAmount, setStakedAmount] = useState("0");
  const [stakingTime, setStakingTime] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [stakeInput, setStakeInput] = useState("");
  const [rewardInput, setRewardInput] = useState("");

  const checkMetaMask = () => {
    if (!window.ethereum) {
      throw new Error("MetaMask가 설치되지 않았습니다");
    }
  };

  const checkNetwork = async () => {
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (chainId !== REQUIRED_CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: REQUIRED_CHAIN_ID }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: REQUIRED_CHAIN_ID,
                chainName: REQUIRED_CHAIN_NAME,
                nativeCurrency: {
                  name: "AVAX",
                  symbol: "AVAX",
                  decimals: 18,
                },
                rpcUrls: [REQUIRED_RPC_URL],
                blockExplorerUrls: ["https://snowtrace.io/"],
              },
            ],
          });
        } else {
          throw switchError;
        }
      }
    }
  };

  const checkOwner = async (userAccount) => {
    if (!userAccount) return;
    try {
      const provider = new BrowserProvider(window.ethereum);
      const stakingContract = new Contract(
        STAKING_ADDRESS,
        ["function owner() view returns (address)"],
        provider
      );
      const ownerAddress = await stakingContract.owner();
      setIsOwner(ownerAddress.toLowerCase() === userAccount.toLowerCase());
    } catch (error) {
      console.error("Owner check failed:", error);
    }
  };

  const updateBalances = async (userAccount) => {
    if (!userAccount) return;

    try {
      checkMetaMask();
      await checkNetwork();

      const provider = new BrowserProvider(window.ethereum);
      const tokenContract = new Contract(
        TOKEN_ADDRESS,
        ["function balanceOf(address) view returns (uint256)"],
        provider
      );
      const stakingContract = new Contract(
        STAKING_ADDRESS,
        [
          "function getStakedAmount(address) view returns (uint256)",
          "function getStakeTimestamp(address) view returns (uint256)"
        ],
        provider
      );

      const [balance, staked, timestamp] = await Promise.all([
        tokenContract.balanceOf(userAccount),
        stakingContract.getStakedAmount(userAccount),
        stakingContract.getStakeTimestamp(userAccount)
      ]);

      setTokenBalance(balance.toString());
      setStakedAmount(staked.toString());
      if (Number(staked) > 0 && Number(timestamp) > 0) {
        setStakingTime(Number(timestamp));
        const currentTime = Math.floor(Date.now() / 1000);
        const endTime = Number(timestamp) + (30 * 24 * 60 * 60); // 30일로 수정
        const remaining = endTime - currentTime;
        setTimeLeft(remaining > 0 ? remaining : 0);
      }
    } catch (error) {
      console.error("잔액 업데이트 실패:", error);
      setStatus({
        type: "error",
        message: error.message
      });
    }
  };

  const handleStaking = async () => {
    if (!account || !stakeInput) {
      setStatus({
        type: "error",
        message: "지갑 연결과 스테이킹 금액을 확인해주세요!"
      });
      return;
    }

    try {
      checkMetaMask();
      await checkNetwork();

      const amount = parseEther(stakeInput);
      if (Number(amount) <= 0) {
        throw new Error("0보다 큰 금액을 입력해주세요!");
      }

      if (Number(amount) > Number(tokenBalance)) {
        throw new Error("잔액이 부족합니다!");
      }

      setLoading(prev => ({ ...prev, stake: true }));
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const tokenContract = new Contract(
        TOKEN_ADDRESS,
        ["function approve(address, uint256) returns (bool)"],
        signer
      );

      const stakingContract = new Contract(
        STAKING_ADDRESS,
        ["function stake(uint256)"],
        signer
      );

      setStatus({ type: "info", message: "토큰 승인을 진행합니다..." });
      const approveTx = await tokenContract.approve(STAKING_ADDRESS, amount);
      await approveTx.wait();

      setStatus({ type: "info", message: "스테이킹을 진행합니다..." });
      const stakeTx = await stakingContract.stake(amount);
      await stakeTx.wait();

      await updateBalances(account);
      setStakeInput("");
      setStatus({ type: "success", message: "스테이킹이 완료되었습니다!" });
    } catch (error) {
      console.error("Staking error:", error);
      setStatus({
        type: "error",
        message: error.message || "스테이킹에 실패했습니다"
      });
    } finally {
      setLoading(prev => ({ ...prev, stake: false }));
    }
  };

  const handleUnstake = async () => {
    if (!account) {
      setStatus({
        type: "error",
        message: "먼저 지갑을 연결해주세요!"
      });
      return;
    }

    try {
      checkMetaMask();
      await checkNetwork();

      setLoading(prev => ({ ...prev, unstake: true }));
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const stakingContract = new Contract(
        STAKING_ADDRESS,
        ["function withdraw()"],
        signer
      );

      setStatus({ type: "info", message: "언스테이킹 진행 중..." });
      const tx = await stakingContract.withdraw();
      await tx.wait();

      await updateBalances(account);
      setStatus({
        type: "success",
        message: "언스테이킹이 완료되었습니다!"
      });
    } catch (error) {
      console.error(error);
      setStatus({
        type: "error",
        message: error.message || "언스테이킹에 실패했습니다"
      });
    } finally {
      setLoading(prev => ({ ...prev, unstake: false }));
    }
  };

  const handleAddReward = async () => {
    if (!account || !rewardInput) return;

    try {
      checkMetaMask();
      await checkNetwork();

      setLoading(prev => ({ ...prev, reward: true }));
      const amount = parseEther(rewardInput);

      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const tokenContract = new Contract(
        TOKEN_ADDRESS,
        ["function approve(address, uint256) returns (bool)"],
        signer
      );

      const stakingContract = new Contract(
        STAKING_ADDRESS,
        ["function addToRewardPool(uint256)"],
        signer
      );

      setStatus({ type: "info", message: "토큰 승인을 진행합니다..." });
      const approveTx = await tokenContract.approve(STAKING_ADDRESS, amount);
      await approveTx.wait();

      setStatus({ type: "info", message: "리워드 풀에 토큰을 추가합니다..." });
      const addTx = await stakingContract.addToRewardPool(amount);
      await addTx.wait();

      setRewardInput("");
      setStatus({ type: "success", message: "리워드 풀 충전이 완료되었습니다!" });
    } catch (error) {
      console.error("Add reward error:", error);
      setStatus({
        type: "error",
        message: error.message || "리워드 풀 충전에 실패했습니다"
      });
    } finally {
      setLoading(prev => ({ ...prev, reward: false }));
    }
  };

  const connectWallet = async () => {
    try {
      checkMetaMask();
      setLoading(prev => ({ ...prev, wallet: true }));
      await checkNetwork();

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts"
      });
      const newAccount = accounts[0];
      setAccount(newAccount);
      await checkOwner(newAccount);
      setStatus({
        type: "success",
        message: "지갑이 연결되었습니다!"
      });

      await updateBalances(newAccount);
    } catch (error) {
      console.error(error);
      setStatus({
        type: "error",
        message: error.message || "지갑 연결에 실패했습니다"
      });
    } finally {
      setLoading(prev => ({ ...prev, wallet: false }));
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setStatus({ type: "success", message: "주소가 복사되었습니다!" });
  };

  useEffect(() => {
    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        setAccount("");
        setStatus({
          type: "info",
          message: "지갑이 연결 해제되었습니다"
        });
      } else if (accounts[0] !== account) {
        setAccount(accounts[0]);
        updateBalances(accounts[0]);
      }
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    if (window.ethereum) {
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);

      return () => {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      };
    }
  }, [account]);

  useEffect(() => {
    if (stakingTime && Number(stakedAmount) > 0) {
      const timeInterval = setInterval(() => {
        const currentTime = Math.floor(Date.now() / 1000);
        const endTime = Number(stakingTime) + (30 * 24 * 60 * 60); // 30일
        const remaining = endTime - currentTime;
        setTimeLeft(remaining > 0 ? remaining : 0);
      }, 1000);

      return () => clearInterval(timeInterval);
    }
  }, [stakingTime, stakedAmount]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: 'url(https://framerusercontent.com/images/2VOSuH59DNICI531guf3Mnd2w6E.jpg?lossless=1)' }}>
      <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-lg p-6 bg-opacity-90">
        <h1 className="text-3xl font-bold text-center mb-2">$Diao 스테이킹</h1>
        <div className="text-center mb-6">
          <p className="text-xl font-semibold text-blue-600">APY 1,174%</p>
          <p className="text-sm text-gray-500">30일 스테이킹 후 50% 이자 지급</p>
        </div>

        {!account ? (
          <button
            onClick={connectWallet}
            disabled={loading.wallet}
            className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 flex items-center justify-center text-lg"
          >
            {loading.wallet ? (
              <Loader2 className="animate-spin mr-2" />
            ) : (
              <Wallet className="mr-2" />
            )}
            지갑 연결
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-gray-500">연결된 지갑</p>
              <p className="font-medium">{account.slice(0, 6)}...{account.slice(-4)}</p>
            </div>

            <div className="flex justify-between items-center">
              <p className="text-gray-500">보유량</p>
              <p className="font-medium">{Number(formatEther(tokenBalance)).toFixed(2)} DIAO</p>
            </div>

            {Number(stakedAmount) > 0 && (
              <div className="space-y-2 p-4 bg-blue-50 rounded-lg">
                <div className="flex justify-between items-center">
                  <p className="text-gray-600">스테이킹된 금액</p>
                  <p className="font-medium">{Number(formatEther(stakedAmount)).toFixed(2)} DIAO</p>
                </div>  {timeLeft !== null && (
                  <p className="text-sm">
                    {timeLeft > 0 ? (
                      <span className="text-blue-600">
                        언스테이킹까지: {formatTime(timeLeft)}
                      </span>
                    ) : (
                      <span className="text-green-600">
                        출금 가능
                      </span>
                    )}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-3">
              <input
                type="number"
                value={stakeInput}
                onChange={(e) => setStakeInput(e.target.value)}
                placeholder="스테이킹할 금액"
                className="w-full p-3 border rounded-lg text-lg"
              />

              <div className="flex gap-3 flex-col">
                <div className="flex gap-3">
                  <button
                    onClick={handleStaking}
                    disabled={loading.stake || !stakeInput}
                    className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 flex items-center justify-center"
                  >
                    {loading.stake ? (
                      <Loader2 className="animate-spin mr-2" />
                    ) : (
                      <Lock className="mr-2" />
                    )}
                    스테이킹
                  </button>

                  <button
                    onClick={handleUnstake}
                    disabled={loading.unstake || !Number(stakedAmount) || (timeLeft && timeLeft > 0)}
                    className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 flex items-center justify-center"
                  >
                    {loading.unstake ? (
                      <Loader2 className="animate-spin mr-2" />
                    ) : (
                      <Unlock className="mr-2" />
                    )}
                    언스테이킹
                  </button>
                </div>

                <button
                  onClick={() => window.open('https://pumpspace.io/#/token/0xd2358dAf3b0b0208F4eAdAd6f8d9Dc554cc8d776', '_blank')}
                  className="w-full px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center justify-center"
                >
                  $DIAO 구입
                </button>
              </div>

              {/* Owner UI */}
              {isOwner && (
                <div className="mt-6 p-4 bg-yellow-50 rounded-lg space-y-3">
                  <h2 className="text-lg font-semibold">관리자 기능</h2>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={rewardInput}
                      onChange={(e) => setRewardInput(e.target.value)}
                      placeholder="리워드 풀 충전량"
                      className="flex-1 p-2 border rounded"
                    />
                    <button
                      onClick={handleAddReward}
                      disabled={loading.reward || !rewardInput}
                      className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:bg-gray-400 flex items-center"
                    >
                      {loading.reward ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Plus size={20} />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowDetails(!showDetails)}
                className="w-full flex items-center justify-between p-3 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <span>컨트랙트 정보</span>
                <ChevronDown className={`transform transition-transform ${showDetails ? 'rotate-180' : ''}`} />
              </button>

              {showDetails && (
                <div className="space-y-2 p-4 bg-gray-50 rounded-lg text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">토큰 주소</span>
                    <button
                      onClick={() => copyToClipboard(TOKEN_ADDRESS)}
                      className="text-blue-500 hover:text-blue-600 flex items-center"
                    >
                      <span className="mr-1">{TOKEN_ADDRESS.slice(0, 6)}...{TOKEN_ADDRESS.slice(-4)}</span>
                      <Copy size={14} />
                    </button>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">스테이킹 주소</span>
                    <button
                      onClick={() => copyToClipboard(STAKING_ADDRESS)}
                      className="text-blue-500 hover:text-blue-600 flex items-center"
                    >
                      <span className="mr-1">{STAKING_ADDRESS.slice(0, 6)}...{STAKING_ADDRESS.slice(-4)}</span>
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {status.message && (
              <div className={`mt-4 p-4 rounded-lg ${status.type === 'error' ? 'bg-red-50 text-red-700' :
                status.type === 'success' ? 'bg-green-50 text-green-700' :
                  'bg-blue-50 text-blue-700'
                }`}>
                {status.message}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;