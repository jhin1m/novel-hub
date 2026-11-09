# Production images. Targets:
#   web     Nitro server bundle (`apps/web/.output`), no workspace node_modules.
#   worker  Workspace sources run through tsx; also used for one-shot jobs (migrate, seed, reindex).
#
# Build on the same CPU architecture and glibc as the host that runs it: `sharp` ships a
# platform-specific binary that Nitro traces into `.output`.

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    CI=true
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable
WORKDIR /app

# Workspace manifests and lockfile only, so the install layers are reused until dependencies change.
FROM base AS manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json

FROM manifests AS web-build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY . .
# Compile the Paraglide messages (the root postinstall hook) before the web build imports them.
RUN pnpm i18n:compile && pnpm --filter @novel-hub/web build

FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=web-build /app/apps/web/.output ./
USER node
EXPOSE 3000
CMD ["node", "server/index.mjs"]

FROM manifests AS worker
COPY packages packages
COPY apps/worker apps/worker
# Only the worker, the CLI scripts (auth) and migrations (db) with their dependency closure; the
# web app and its tooling stay out of the image. One layer on purpose: the Paraglide compiler and
# its ~500 MB of toolchain are needed only to generate the messages, so they are deleted again
# (with the package manager's metadata cache) before the layer is written.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts \
      --filter "@novel-hub/worker..." --filter "@novel-hub/auth..." --filter "@novel-hub/db..." \
 && pnpm i18n:compile \
 && rm -rf node_modules/.pnpm/@lix-js* node_modules/.pnpm/binaryen@* /root/.cache/pnpm
ENV NODE_ENV=production
# `tsx` is a dependency of the worker package only, so `--import tsx` resolves from here. One-shot
# commands use paths relative to this directory (../../packages/db/src/migrate.ts).
WORKDIR /app/apps/worker
# Code is read-only for the runtime user.
USER node
CMD ["node", "--import", "tsx", "src/index.ts"]
