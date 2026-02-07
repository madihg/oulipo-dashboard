#!/bin/bash
# Oulipo Dashboard - Development Environment Setup
# Next.js 14 App Router with vanilla CSS

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "========================================"
echo "  Oulipo Dashboard - Setup & Start"
echo "========================================"

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed. Please install Node.js 18+."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "ERROR: Node.js 18+ required. Current version: $(node -v)"
    exit 1
fi

echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"

# Check for .env.local
if [ ! -f ".env.local" ]; then
    echo ""
    echo "WARNING: .env.local not found. Creating template..."
    cat > .env.local << 'ENVEOF'
# Oulipo Dashboard Environment Variables
# Fill in your actual values below

DASHBOARD_PASSWORD=your_password_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Local oulipo repo path (for events.json and HTML files)
OULIPO_REPO_PATH=/Users/halim/Documents/oulipo
ENVEOF
    echo "Created .env.local template. Please fill in your actual values."
fi

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

# Build check (optional, skip if in dev mode)
if [ "$1" = "--build" ]; then
    echo ""
    echo "Building project..."
    npm run build
fi

# Start the development server
echo ""
echo "========================================"
echo "  Starting Oulipo Dashboard"
echo "========================================"
echo ""
echo "  URL: http://localhost:3000"
echo "  Mode: Development"
echo ""
echo "  Gallery tools:"
echo "    - Content Publisher (Substack + Instagram)"
echo "    - Update Events"
echo "    - Deadline Calendar"
echo ""
echo "  Press Ctrl+C to stop the server"
echo "========================================"
echo ""

npm run dev
