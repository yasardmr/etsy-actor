# Use Playwright-enabled base image (REQUIRED for browser automation)
FROM apify/actor-node-playwright-chrome:20

# Copy all files
COPY . ./

# Install dependencies and build
RUN npm install --quiet --only=prod --no-optional \
    && npm run build \
    && (npm list || true)

CMD ["npm", "start"]
