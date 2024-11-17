# Use the official Node.js LTS image
FROM node:18

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install app dependencies inside the Docker container
RUN npm install

# Command to run your app
CMD [ "npm", "start" ]
