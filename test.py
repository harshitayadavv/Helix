from google import genai

api_key = "put your key here temporarily, or read from env"
import os
api_key = os.environ.get("GEMINI_API_KEY")

# Test 1: default client (v1beta)
print("--- Testing default client (v1beta) ---")
client_default = genai.Client(api_key=api_key)
try:
    result = client_default.models.embed_content(
        model="gemini-embedding-001",
        contents="test sentence"
    )
    print("SUCCESS on v1beta:", len(result.embeddings[0].values), "dims")
except Exception as e:
    print("FAILED on v1beta:", type(e).__name__, str(e)[:200])

# Test 2: explicit v1 client
print()
print("--- Testing v1 client ---")
client_v1 = genai.Client(api_key=api_key, http_options={"api_version": "v1"})
try:
    result = client_v1.models.embed_content(
        model="gemini-embedding-001",
        contents="test sentence"
    )
    print("SUCCESS on v1:", len(result.embeddings[0].values), "dims")
except Exception as e:
    print("FAILED on v1:", type(e).__name__, str(e)[:200])