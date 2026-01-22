FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install \
	&& npm install @rollup/rollup-linux-x64-gnu

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "--port", "3000"]
