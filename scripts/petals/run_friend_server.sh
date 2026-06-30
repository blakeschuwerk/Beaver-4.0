#!/usr/bin/env bash
# Joins a private Petals swarm and hosts a shard of the model on this machine.
# Requires an NVIDIA GPU with Docker + the NVIDIA Container Toolkit installed.
#
# Usage: ./run_friend_server.sh <bootstrap-multiaddr>
# Example bootstrap-multiaddr: /ip4/203.0.113.7/tcp/31337/p2p/QmAbC123...
# (get this string from whoever is running run_bootstrap.sh)
set -euo pipefail

MODEL="${PETALS_MODEL:-meta-llama/Llama-3.1-8B-Instruct}"
PEERS="${1:-}"

if [ -z "$PEERS" ]; then
  echo "Usage: $0 <bootstrap-multiaddr>"
  echo "Ask the project owner for their bootstrap address (looks like /ip4/.../tcp/.../p2p/...)"
  exit 1
fi

echo "Joining swarm for model: ${MODEL}"
echo "Bootstrap peer: ${PEERS}"
echo "Leave this window open — closing it removes your shard from the swarm."
echo
echo "To stop and free up space later:"
echo "  1. Press Ctrl+C to stop this script"
echo "  2. Run: docker container prune  (delete stopped containers)"
echo "  3. Run: docker rmi learningathome/petals:main  (delete the image, optional)"
echo

docker run --gpus all learningathome/petals:main \
  python -m petals.cli.run_server "${MODEL}" --initial_peers "${PEERS}"
