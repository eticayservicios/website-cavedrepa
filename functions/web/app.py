"""Stub HTTP handler for cavedrepa-web. Business logic comes in a later step."""

import json
import os

TABLE_NAME = os.environ.get("TABLE_NAME", "")


def lambda_handler(event, context):
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(
            {
                "ok": True,
                "service": "cavedrepa-web",
                "tableConfigured": bool(TABLE_NAME),
            }
        ),
    }
