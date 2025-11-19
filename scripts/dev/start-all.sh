#!/bin/bash
# Start all development services in tmux windows
# Requires tmux to be installed

set -e

SESSION_NAME="playlist-manager"

# Check if tmux session already exists
if tmux has-session -t $SESSION_NAME 2>/dev/null; then
  echo "Session '$SESSION_NAME' already exists."
  read -p "Kill existing session and create new one? [y/N]: " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    tmux kill-session -t $SESSION_NAME
  else
    echo "Attaching to existing session..."
    tmux attach-session -t $SESSION_NAME
    exit 0
  fi
fi

echo "🚀 Starting all services in tmux..."
echo "   Session name: $SESSION_NAME"
echo ""

# Create new tmux session
tmux new-session -d -s $SESSION_NAME -n "docker"

# Window 0: Docker logs
tmux send-keys -t $SESSION_NAME:0 "docker-compose up" C-m

# Window 1: API server
tmux new-window -t $SESSION_NAME:1 -n "api"
tmux send-keys -t $SESSION_NAME:1 "pnpm api:dev" C-m

# Window 2: Worker (if exists)
if [ -d "apps/worker" ]; then
  tmux new-window -t $SESSION_NAME:2 -n "worker"
  tmux send-keys -t $SESSION_NAME:2 "pnpm --filter @app/worker dev" C-m
fi

# Window 3: Shell (for running commands)
tmux new-window -t $SESSION_NAME:3 -n "shell"
tmux send-keys -t $SESSION_NAME:3 "# Ready for commands. Try: make health" C-m

# Select first window (docker logs)
tmux select-window -t $SESSION_NAME:0

echo "✓ All services started in tmux session"
echo ""
echo "Tmux Commands:"
echo "  Ctrl+b n    - Next window"
echo "  Ctrl+b p    - Previous window"
echo "  Ctrl+b 0-3  - Jump to window 0, 1, 2, or 3"
echo "  Ctrl+b d    - Detach from session (keeps running)"
echo "  Ctrl+b &    - Kill current window"
echo "  Ctrl+c      - Stop service in current window"
echo ""
echo "To reattach later:"
echo "  tmux attach-session -t $SESSION_NAME"
echo ""
echo "To kill all services:"
echo "  tmux kill-session -t $SESSION_NAME"
echo ""

# Attach to the session
tmux attach-session -t $SESSION_NAME
