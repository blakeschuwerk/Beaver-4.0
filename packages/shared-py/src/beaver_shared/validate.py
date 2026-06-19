"""Validate pydantic models against canonical JSON Schemas."""

import json
from pathlib import Path
from typing import Any, Type

import jsonschema
from pydantic import BaseModel


def _contracts_dir() -> Path:
    return Path(__file__).resolve().parents[3] / "shared" / "contracts"


def load_json_schema(name: str) -> dict[str, Any]:
    path = _contracts_dir() / f"{name}.json"
    with open(path) as f:
        return json.load(f)


def validate_against_schema(data: dict[str, Any], schema_name: str) -> None:
    schema = load_json_schema(schema_name)
    jsonschema.validate(instance=data, schema=schema)


def model_to_validated_dict(model: BaseModel, schema_name: str) -> dict[str, Any]:
    data = json.loads(model.model_dump_json())
    validate_against_schema(data, schema_name)
    return data
