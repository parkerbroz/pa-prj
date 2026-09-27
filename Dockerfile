FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY lib ./lib
COPY public ./public
RUN mkdir -p /app/data
ENV HOST=0.0.0.0 PORT=3000 DATA_FILE=/app/data/store.json
EXPOSE 3000
CMD ["npm", "start"]
