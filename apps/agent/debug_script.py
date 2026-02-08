import os
import sys
import logging
import socket

# Force stdout/stderr to unbuffered
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

print("Python script starting...")

try:
    from core.server import server, configure_server_for_http, set_transport_mode
    from fastmcp import FastMCP
    import uvicorn
except ImportError as e:
    print(f"Import Error: {e}")
    sys.exit(1)

print("Imports successful.")

# Setup Env
os.environ["MCP_ENABLE_OAUTH21"] = "true"
os.environ["WORKSPACE_MCP_STATELESS_MODE"] = "true"
os.environ["EXTERNAL_OAUTH21_PROVIDER"] = "true"
# os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1" # Passed from parent env

print("Configuring server for HTTP...")
try:
    set_transport_mode("streamable-http")
    configure_server_for_http()
except Exception as e:
    print(f"Configuration failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("Starting Server via FastMCP.run()...")
try:
    server.run(transport="streamable-http", host="0.0.0.0", port=8001)
except Exception as e:
    print(f"FastMCP.run failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
