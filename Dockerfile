FROM nginx:stable-alpine

COPY index.html styles.css app.js sw.js manifest.json /usr/share/nginx/html/
COPY icons/ /usr/share/nginx/html/icons/
COPY vendor/ /usr/share/nginx/html/vendor/

EXPOSE 80
