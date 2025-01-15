import React, { useState, useEffect } from "react";
import { Wallet, Lock, Unlock, Loader2 } from "lucide-react";

const TOKEN_ADDRESS = "0xd2358dAf3b0b0208F4eAdAd6f8d9Dc554cc8d776";
const STAKING_ADDRESS = "0xE24067Fe11168FA6b960250C09D493D3CCE44501";

const SELECTORS = {
  balanceOf: "0x70a08231",     // balanceOf(address)
  approve: "0x095ea7b3",       // approve(address,uint256)
  stake: "0xa694fc3a",         // stake(uint256)
  withdraw: "0x3ccfd60b",      // withdraw()
  getStakedAmount: "0x4da6a556",   // 실제 컨트랙트의 getStakedAmount(address)
  getStakeTimestamp: "0x8351ac03"  // 실제 컨트랙트의 getStakeTimestamp(address)
};


const formatTime = (seconds) => {
  if (!seconds) return "";
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  return `${days}일 ${hours}시간 ${minutes}분`;
};

const App = () => {
  const [account, setAccount] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [tokenBalance, setTokenBalance] = useState("0");
  const [stakedAmount, setStakedAmount] = useState("0");
  const [stakingTime, setStakingTime] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [stakeInput, setStakeInput] = useState("");
  const updateBalances = async (userAccount) => {
    if (!userAccount) return;

    try {
      // Token Balance
      const tokenData = {
        to: TOKEN_ADDRESS,
        data: `${SELECTORS.balanceOf}000000000000000000000000${userAccount.slice(2)}`
      };
      const balance = await window.ethereum.request({
        method: 'eth_call',
        params: [tokenData, 'latest']
      });
      setTokenBalance(parseInt(balance, 16).toString());
      console.log("Token balance:", parseInt(balance, 16).toString());

      // Staked Amount using getStakedAmount function
      const stakedData = {
        to: STAKING_ADDRESS,
        data: `${SELECTORS.getStakedAmount}000000000000000000000000${userAccount.slice(2)}`
      };

      try {
        console.log("Calling getStakedAmount with data:", stakedData.data);
        const staked = await window.ethereum.request({
          method: 'eth_call',
          params: [stakedData, 'latest']
        });
        console.log("Raw staked response:", staked);
        const stakedValue = parseInt(staked, 16).toString();
        console.log("Parsed staked amount:", stakedValue);
        setStakedAmount(stakedValue);

        if (Number(stakedValue) > 0) {
          // Get Staking Time using getStakeTimestamp function
          const timestampData = {
            to: STAKING_ADDRESS,
            data: `${SELECTORS.getStakeTimestamp}000000000000000000000000${userAccount.slice(2)}`
          };

          console.log("Calling getStakeTimestamp with data:", timestampData.data);
          const timestamp = await window.ethereum.request({
            method: 'eth_call',
            params: [timestampData, 'latest']
          });
          console.log("Raw timestamp:", timestamp);
          const timestampValue = parseInt(timestamp, 16);
          console.log("Parsed timestamp:", timestampValue);

          if (timestampValue > 0) {
            setStakingTime(timestampValue);
            const currentTime = Math.floor(Date.now() / 1000);
            const endTime = timestampValue + (30 * 24 * 60 * 60);
            const remaining = endTime - currentTime;
            console.log("Calculated remaining time:", remaining);
            setTimeLeft(remaining > 0 ? remaining : 0);
          }
        }
      } catch (error) {
        console.error("Contract call failed:", error);
        console.error("Error details:", JSON.stringify(error, null, 2));
      }
    } catch (error) {
      console.error("잔액 업데이트 실패:", error);
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

    setLoading(true);
    try {
      const amount = Math.floor(parseFloat(stakeInput) * Math.pow(10, 18))
        .toString(16)
        .padStart(64, '0');

      // Approve
      setStatus({ type: "info", message: "토큰 승인을 진행합니다..." });
      const approveData = {
        from: account,
        to: TOKEN_ADDRESS,
        data: `0x095ea7b3000000000000000000000000${STAKING_ADDRESS.slice(2)}${amount}`
      };
      const approveTx = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [approveData]
      });

      await waitForTransaction(approveTx);

      // Stake
      setStatus({ type: "info", message: "스테이킹을 진행합니다..." });
      const stakeData = {
        from: account,
        to: STAKING_ADDRESS,
        data: `0xa694fc3a${amount}`
      };
      const stakeTx = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [stakeData]
      });

      await waitForTransaction(stakeTx);
      await updateBalances(account);
      setStakeInput("");
      setStatus({ type: "success", message: "스테이킹이 완료되었습니다!" });
    } catch (error) {
      console.error("Staking error:", error);
      setStatus({
        type: "error",
        message: `스테이킹 실패: ${error.message}`
      });
    } finally {
      setLoading(false);
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
      setLoading(true);
      setStatus({ type: "info", message: "언스테이킹 진행 중..." });

      const withdrawData = {
        from: account,
        to: STAKING_ADDRESS,
        data: "0x3ccfd60b"
      };

      const tx = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [withdrawData]
      });

      await waitForTransaction(tx);
      await updateBalances(account);
      setStatus({
        type: "success",
        message: "언스테이킹이 완료되었습니다!"
      });
    } catch (error) {
      console.error(error);
      setStatus({
        type: "error",
        message: "언스테이킹 실패: " + error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const waitForTransaction = async (txHash) => {
    while (true) {
      const receipt = await window.ethereum.request({
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      });
      if (receipt) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setStatus({
        type: "error",
        message: "MetaMask를 설치해주세요!"
      });
      return;
    }

    try {
      setLoading(true);
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts"
      });
      const newAccount = accounts[0];
      setAccount(newAccount);
      setStatus({
        type: "success",
        message: "지갑이 연결되었습니다!"
      });

      await updateBalances(newAccount);
    } catch (error) {
      console.error(error);
      setStatus({
        type: "error",
        message: "지갑 연결에 실패했습니다: " + error.message
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let intervalId;

    if (account) {
      updateBalances(account);
      intervalId = setInterval(() => {
        updateBalances(account);
      }, 10000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [account]);

  useEffect(() => {
    if (stakingTime && Number(stakedAmount) > 0) {
      const timeInterval = setInterval(() => {
        const currentTime = Math.floor(Date.now() / 1000);
        const endTime = Number(stakingTime) + (30 * 24 * 60 * 60);
        const remaining = endTime - currentTime;

        if (remaining <= 0) {
          setTimeLeft(0);
          clearInterval(timeInterval);
        } else {
          setTimeLeft(remaining);
        }
      }, 1000);

      return () => clearInterval(timeInterval);
    }
  }, [stakingTime, stakedAmount]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: 'url(https://framerusercontent.com/images/2VOSuH59DNICI531guf3Mnd2w6E.jpg?lossless=1)' }}>
      <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-lg p-6 bg-opacity-90">
        <h1 className="text-2xl font-bold text-center mb-6">$Diao 스테이킹</h1>

        {!account ? (
          <button
            onClick={connectWallet}
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 flex items-center justify-center"
          >
            {loading ? (
              <Loader2 className="animate-spin mr-2" />
            ) : (
              <Wallet className="mr-2" />
            )}
            지갑 연결하기
          </button>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              연결된 지갑: {account.slice(0, 6)}...{account.slice(-4)}
            </p>

            <p className="text-sm">
              보유량: {(Number(tokenBalance) / 1e18).toFixed(6)} DIAO
            </p>

            {Number(stakedAmount) > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  스테이킹된 금액: {(Number(stakedAmount) / 1e18).toFixed(6)} DIAO
                </p>
                {timeLeft !== null && (
                  <p className="text-sm">
                    {timeLeft > 0 ? (
                      <span className="text-blue-600">
                        언스테이킹까지 남은 시간: {formatTime(timeLeft)}
                      </span>
                    ) : (
                      <span className="text-green-600">
                        스테이킹 기간이 완료되었습니다! 이제 출금하실 수 있습니다.
                      </span>
                    )}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <input
                type="number"
                value={stakeInput}
                onChange={(e) => setStakeInput(e.target.value)}
                placeholder="스테이킹할 금액"
                className="w-full p-2 border rounded"
              />

              <div className="flex gap-4">
                <button
                  onClick={handleStaking}
                  disabled={loading || !stakeInput}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 flex items-center justify-center"
                >
                  {loading ? (
                    <Loader2 className="animate-spin mr-2" />
                  ) : (
                    <Lock className="mr-2" />
                  )}
                  스테이킹
                </button>

                <button
                  onClick={handleUnstake}
                  disabled={loading || !Number(stakedAmount) || (timeLeft && timeLeft > 0)}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 flex items-center justify-center"
                >
                  {loading ? (
                    <Loader2 className="animate-spin mr-2" />
                  ) : (
                    <Unlock className="mr-2" />
                  )}
                  언스테이킹
                </button>
              </div>
            </div>
          </div>
        )}

        {status.message && (
          <div className={`mt-4 p-4 rounded ${status.type === 'error' ? 'bg-red-100 text-red-700' :
            status.type === 'success' ? 'bg-green-100 text-green-700' :
              'bg-blue-100 text-blue-700'
            }`}>
            {status.message}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;