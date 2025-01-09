FROM node:22.12-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .

# Ensure .env and whitelist.json exist before proceeding
RUN test -f .env || (echo ".env file not found. Please follow the instructions in README.md on how to correctly setup the application." && exit 1)
RUN test -f whitelist.json || (echo "whitelist.json not found. Please follow the instructions in README.md on how to correctly setup the application." && exit 1)

ENV NODE_ENV=production
ENV NODE_PORT=5021
ENV LOG_TO_CONSOLE='true'

RUN npm run compile
EXPOSE 5021
CMD ["node", "dist/index.js"]
