FROM node:20-alpine

WORKDIR /app

COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

COPY server ./server
COPY client ./client

WORKDIR /app/server
ENV NODE_ENV=production

# Cloud Run injects PORT (defaults to 8080); index.js already reads
# process.env.PORT, so no code change is needed for that.
EXPOSE 8080

CMD ["npm", "start"]
