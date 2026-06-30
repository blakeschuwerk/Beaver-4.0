@echo off
REM Joins a private Petals swarm and hosts a shard of the model on this machine.
REM Requires an NVIDIA GPU with Docker Desktop (WSL2 backend) installed.
REM
REM Usage: run_friend_server.bat <bootstrap-multiaddr>
REM Example: /ip4/203.0.113.7/tcp/31337/p2p/QmAbC123...
REM (get this string from whoever is running run_bootstrap.sh)

setlocal
set MODEL=meta-llama/Llama-3.1-8B-Instruct
set PEERS=%1

if "%PEERS%"=="" (
  echo Usage: %0 ^<bootstrap-multiaddr^>
  echo Ask the project owner for their bootstrap address ^(looks like /ip4/.../tcp/.../p2p/...^)
  exit /b 1
)

echo Joining swarm for model: %MODEL%
echo Bootstrap peer: %PEERS%
echo Leave this window open -- closing it removes your shard from the swarm.
echo.

docker run --gpus all learningathome/petals:main python -m petals.cli.run_server %MODEL% --initial_peers %PEERS%
