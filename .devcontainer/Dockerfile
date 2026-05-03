# syntax=docker/dockerfile:1.6
# DevContainer for the everything-claude-code harness.
# See ADR 0004 for design rationale.

FROM mcr.microsoft.com/devcontainers/javascript-node:1-20-bookworm

# Install Yarn 4.9.2 via corepack (the harness's pinned package manager)
RUN corepack enable \
    && corepack prepare yarn@4.9.2 --activate

# Install Claude Code CLI globally so the container can serve as a clean-room
# sandbox for running Claude Code with this plugin pre-installed.
# (~50 MB; harmless when only used for harness dev.)
RUN npm install -g @anthropic-ai/claude-code \
    || echo "Warning: @anthropic-ai/claude-code install failed; container will still work for harness dev"

# Playwright system dependencies (Chromium needs ~30 libs).
# Installed at image build time so the playwright MCP works on first start.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        jq \
        libnss3 \
        libatk-bridge2.0-0 \
        libdrm2 \
        libxkbcommon0 \
        libxcomposite1 \
        libxdamage1 \
        libxrandr2 \
        libgbm1 \
        libpango-1.0-0 \
        libcairo2 \
        libasound2 \
        libatspi2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Pre-create the directories that named volumes mount onto, with `node` ownership.
# Docker copies the image-side directory contents (and ownership metadata) into
# a volume on first mount, so this ensures the `node` user can write to:
#   - /home/node/.yarn/berry/cache
#   - /home/node/.npm
#   - /home/node/.claude
#   - /workspaces/agent_harness/node_modules
# Without this, named volumes initialize root-owned and yarn fails with EACCES.
RUN mkdir -p /home/node/.yarn/berry/cache \
             /home/node/.npm \
             /home/node/.claude \
             /workspaces/agent_harness/node_modules \
    && chown -R node:node /home/node /workspaces/agent_harness

# Persistent shell environment for the node user.
# - GITHUB_TOKEN / GH_TOKEN unset on every interactive shell so gh reads
#   the stored auth from the bind-mounted ~/.config/gh instead of an
#   invalid token leaked from the host environment.
# - XDG_CONFIG_HOME anchored to ~/.config so every XDG-aware tool finds
#   the same canonical location regardless of host OS conventions.
RUN printf 'unset GITHUB_TOKEN\nunset GH_TOKEN\nexport XDG_CONFIG_HOME="$HOME/.config"\n' \
        > /etc/profile.d/ecc-env.sh \
    && chmod 0644 /etc/profile.d/ecc-env.sh

# Disable commit/tag signing at the system level. The container has no access
# to host SSH/GPG keys by default; signing would fail with "key not found"
# (especially when host user.signingkey points at a Windows-only path).
# Per-repo override is still possible if a Linux-side key is later mounted.
RUN git config --system commit.gpgsign false \
    && git config --system tag.gpgsign false

# Switch to non-root user (provided by base image)
USER node

# Default working dir matches the workspace bind mount
WORKDIR /workspaces/agent_harness
