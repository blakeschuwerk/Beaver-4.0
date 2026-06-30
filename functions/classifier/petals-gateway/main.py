"""OpenAI-compatible bridge in front of a private Petals swarm.

functions/classifier/src/llm-client.ts already POSTs to any OpenAI-compatible
/chat/completions endpoint and reads choices[0].message.content (see
LLM_ENDPOINT_URL). This service speaks that same shape on one side, and on the
other side runs the actual generation against a private Petals swarm via
AutoDistributedModelForCausalLM — so F4 needs zero code changes to use it,
just LLM_ENDPOINT_URL pointed here instead of RunPod.

Run: uvicorn main:app --port 8000
Env:
  PETALS_MODEL      default meta-llama/Llama-3.1-8B-Instruct
  PETALS_INITIAL_PEERS  comma-separated multiaddrs of the DHT bootstrap node(s)
"""

from __future__ import annotations

import os
import time
from typing import Any

import torch
from fastapi import FastAPI, HTTPException
from petals import AutoDistributedModelForCausalLM
from pydantic import BaseModel
from transformers import AutoTokenizer

MODEL_NAME = os.environ.get("PETALS_MODEL", "meta-llama/Llama-3.1-8B-Instruct")
INITIAL_PEERS = [p for p in os.environ.get("PETALS_INITIAL_PEERS", "").split(",") if p]
MAX_NEW_TOKENS = int(os.environ.get("PETALS_MAX_NEW_TOKENS", "512"))

app = FastAPI()

_tokenizer: AutoTokenizer | None = None
_model: AutoDistributedModelForCausalLM | None = None


def _load() -> None:
    global _tokenizer, _model
    if _model is not None:
        return
    kwargs: dict[str, Any] = {}
    if INITIAL_PEERS:
        kwargs["initial_peers"] = INITIAL_PEERS
    hf_token = os.environ.get("HF_TOKEN")
    _tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, token=hf_token)
    _model = AutoDistributedModelForCausalLM.from_pretrained(MODEL_NAME, token=hf_token, **kwargs)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str | None = None
    messages: list[ChatMessage]
    temperature: float = 0.1
    response_format: dict[str, str] | None = None


@app.get("/health")
def health() -> dict[str, Any]:
    return {"model": MODEL_NAME, "loaded": _model is not None, "initial_peers": INITIAL_PEERS}


@app.post("/v1/chat/completions")
def chat_completions(req: ChatCompletionRequest) -> dict[str, Any]:
    _load()
    assert _tokenizer is not None and _model is not None

    prompt = _tokenizer.apply_chat_template(
        [m.model_dump() for m in req.messages],
        tokenize=False,
        add_generation_prompt=True,
    )
    inputs = _tokenizer(prompt, return_tensors="pt")

    started_at = time.time()
    try:
        with torch.inference_mode():
            outputs = _model.generate(
                **inputs,
                max_new_tokens=MAX_NEW_TOKENS,
                temperature=max(req.temperature, 1e-3),
                do_sample=req.temperature > 0,
            )
    except Exception as e:  # noqa: BLE001 - surfaced as 5xx so the caller's retry/DLQ path kicks in
        raise HTTPException(status_code=503, detail=f"petals generation failed: {e}") from e

    generated = outputs[0, inputs["input_ids"].shape[1] :]
    content = _tokenizer.decode(generated, skip_special_tokens=True)
    latency_ms = int((time.time() - started_at) * 1000)
    print(f'{{"event": "petals_call_ok", "latency_ms": {latency_ms}}}')

    return {
        "choices": [{"message": {"role": "assistant", "content": content}}],
        "model": MODEL_NAME,
    }
