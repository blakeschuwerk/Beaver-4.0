#!/usr/bin/env bash
# Sets up functions/classifier/petals-gateway/.venv with a working dependency
# set. Petals/hivemind haven't been updated since ~2023 and don't install
# cleanly against current defaults — this script encodes the workarounds:
#   - a Python 3.11 interpreter (newer Python breaks hivemind's build)
#   - SSL_CERT_FILE pointed at certifi's bundle (python.org macOS builds don't
#     wire up the system trust store, so hivemind's setup.py can't download
#     its prebuilt p2pd binary over HTTPS without this)
#   - --no-build-isolation + a pinned-down setuptools (hivemind's build needs
#     pkg_resources, which setuptools >=81 removed; build isolation also
#     hides grpc_tools, needed to compile hivemind's .proto files)
# requirements.txt pins versions known to import cleanly together; don't
# upgrade them piecemeal without re-running this end to end.
set -euo pipefail

GATEWAY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../functions/classifier/petals-gateway" && pwd)"
PYTHON311="${PYTHON311:-/Library/Frameworks/Python.framework/Versions/3.11/bin/python3.11}"

if [ ! -x "$PYTHON311" ]; then
  echo "Python 3.11 not found at $PYTHON311 — set PYTHON311=/path/to/python3.11 and retry." >&2
  exit 1
fi

cd "$GATEWAY_DIR"
"$PYTHON311" -m venv .venv
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install "setuptools==65.5.0" wheel grpcio-tools certifi -q

SSL_CERT_FILE="$(.venv/bin/python3 -c "import certifi; print(certifi.where())")"
export SSL_CERT_FILE
.venv/bin/pip install --no-build-isolation hivemind==1.1.10.post2

.venv/bin/pip install "setuptools==65.5.0" -q
.venv/bin/pip install --no-build-isolation -r requirements.txt

.venv/bin/python3 -c "
from petals import AutoDistributedModelForCausalLM
import fastapi, uvicorn
print('petals-gateway dependencies OK')
"

echo "Done. Start the gateway with: pnpm petals:gateway"
