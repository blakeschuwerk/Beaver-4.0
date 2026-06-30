#!/usr/bin/env bash
# Run the Petals DHT bootstrap node — the address your friends' machines dial
# into to join the private swarm. Requires forwarding the chosen port on your
# router to this machine's local IP.
#
# Usage: ./run_bootstrap.sh [port]
set -euo pipefail

PORT="${1:-31337}"

echo "Starting Petals DHT bootstrap node on port ${PORT}..."
echo "Forward TCP port ${PORT} on your router to this machine before friends try to connect."
echo "Watch the output below for a line like:"
echo '  Running a DHT instance. To connect other peers to this one, use --initial_peers /ip4/<...>/tcp/'"${PORT}"'/p2p/<peer-id>'
echo

functions/classifier/petals-gateway/.venv/bin/python3 -m petals.cli.run_dht --host_maddrs "/ip4/0.0.0.0/tcp/${PORT}"
