# --- build ---
FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_API_URL=http://localhost:8000/api/v1
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_MAP_TILES_URL=
ARG VITE_MAP_ATTRIBUTION=
ARG VITE_MAP_SUBDOMAINS=
ENV VITE_MAP_TILES_URL=$VITE_MAP_TILES_URL VITE_MAP_ATTRIBUTION=$VITE_MAP_ATTRIBUTION VITE_MAP_SUBDOMAINS=$VITE_MAP_SUBDOMAINS
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- serve ---
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
