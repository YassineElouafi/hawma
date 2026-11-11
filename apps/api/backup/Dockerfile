FROM postgres:16-alpine
RUN apk add --no-cache openssl
COPY backup.sh restore.sh /usr/local/bin/
ENV BACKUP_DIR=/backups
VOLUME /backups
CMD ["backup.sh", "loop"]
