FROM node:22-alpine
# Baileys installs a dependency (libsignal) from GitHub, so git is required;
# python3/make/g++ cover any optional native builds.
RUN apk add --no-cache git python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .
CMD ["node", "gateway.mjs"]
