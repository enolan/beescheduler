openssl req -config dev-certs/genkey.conf -new -x509 -sha256 -newkey rsa:2048 -nodes -keyout dev-certs/key.pem -days 365 -out dev-certs/cert.pem -batch
