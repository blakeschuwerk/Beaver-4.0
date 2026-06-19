"""F6 Notifier stub — logs matches-created messages."""

import json
import logging
import os

from flask import Flask, jsonify, request

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "beaver-notifier-stub"})


@app.post("/")
def handle_match():
    envelope = request.get_json(silent=True) or {}
    try:
        if envelope.get("message", {}).get("data"):
            raw = envelope["message"]["data"]
            match = json.loads(__import__("base64").b64decode(raw).decode("utf-8"))
        else:
            match = envelope

        logger.info("TODO: Notify user about match — %s", match)
        return jsonify({"status": "stub", "received": match}), 200
    except Exception as e:
        logger.exception("Notifier stub error")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
