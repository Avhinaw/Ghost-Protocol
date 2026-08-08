# 🔑 Master Environment & Secret Registry

Copy this file's structure to `.env` in the project root for local development.

```ini
# ==========================================
# 📜 BLOCKCHAIN CONFIGURATION
# ==========================================
ORACLE_PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000001
ORACLE_ADMIN_ADDRESS=0x0000000000000000000000000000000000000000
BASE_SEPOLIA_RPC_URL=[https://sepolia.base.org](https://sepolia.base.org)
BASESCAN_API_KEY=your_basescan_api_key_here

# ==========================================
# 💻 FRONTEND CONFIGURATION
# ==========================================
NEXT_PUBLIC_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000
NEXT_PUBLIC_IPFS_GATEWAY=[https://gateway.pinata.cloud/ipfs/](https://gateway.pinata.cloud/ipfs/)
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_KEY=your_pinata_secret_key

# ==========================================
# 🤖 BACKEND & AI CONFIGURATION
# ==========================================
PORT=4000
PYTHON_AI_SERVICE_URL=http://localhost:8000
OPENAI_API_KEY=sk-proj-your_openai_api_key_here