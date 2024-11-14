# Use the official Node.js LTS image
FROM node:18

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install app dependencies inside the Docker container
RUN npm install

# Copy the rest of your app's source code
#COPY . .

# Expose port if your app requires it (optional)
# EXPOSE 8080

# Command to run your app
CMD [ "npm", "start" ]
