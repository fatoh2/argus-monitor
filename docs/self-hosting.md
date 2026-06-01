# Self-Hosting Argus Monitor

This guide will walk you through the process of self-hosting Argus Monitor.

## Prerequisites
- Docker and Docker Compose installed
- Sufficient system resources (CPU, RAM, Disk Space). For a small deployment (e.g., 1-5 monitors), a VPS with 2 vCPU and 4GB RAM is a good starting point. Scale up as needed.
- A PostgreSQL database instance (can be run via Docker Compose or externally).
- A Redis instance (can be run via Docker Compose or externally).
- A domain name configured to point to your server's IP address (for SSL).

## Setup Steps

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/fatoh2/argus-monitor.git
    cd argus-monitor
    ```

2.  **Configure Environment Variables**:
    Copy the `.env.example` file to `.env` and fill in your database and Redis credentials, as well as any other required environment variables.
    ```bash
    cp .env.example .env
    # Edit .env file with your specific configurations
    ```
    **Important**:
    *   Ensure `DATABASE_URL` and `REDIS_URL` are correctly set to point to your PostgreSQL and Redis instances.
    *   Do not leave critical variables empty or malformed, as this can lead to application startup failures.
    *   Always use strong, random passwords for `JWT_SECRET`, `BULLMQ_UI_PASSWORD`, and your database/Redis instances.

3.  **Set up Docker Compose**:
    We provide `docker-compose.yml` for local development (which includes example services for PostgreSQL and Redis) and `docker-compose.prod.yml` for production.
    `docker-compose.prod.yml` is designed for production environments and assumes you will provide your own external PostgreSQL and Redis instances. If you prefer to manage PostgreSQL and Redis with Docker Compose in production, you can modify `docker-compose.prod.yml` to include these services from `docker-compose.yml`. Remember to set appropriate volumes and strong passwords.

4.  **Run Migrations and Build Services** (using `docker-compose.prod.yml`):
    Ensure your database and Redis are accessible and properly secured. Then, run the migrations and build the services.
    ```bash
    docker-compose -f docker-compose.prod.yml run --rm api-service npx prisma migrate deploy
    docker-compose -f docker-compose.prod.yml build
    ```

5.  **Start Argus Monitor Services** (using `docker-compose.prod.yml`):
    ```bash
    docker-compose -f docker-compose.prod.yml up -d
    ```

## Configuration

Refer to the `.env.example` file for all available configuration options and their descriptions.

## SSL Configuration (Recommended for Production)

For production deployments, it is highly recommended to use SSL to secure communication. You can achieve this by using a reverse proxy like Nginx or Caddy in front of your Argus Monitor services.

**Example with Nginx (assuming your domain is `monitor.example.com` and services are named `frontend-service` and `api-service` in your `docker-compose.prod.yml`):**

1.  **Install Nginx**:
    ```bash
    sudo apt update
    sudo apt install nginx
    ```

2.  **Configure Nginx**: Create a new Nginx configuration file (e.g., `/etc/nginx/sites-available/argus-monitor`) and link it to `sites-enabled`.

    ```nginx
    server {
        listen 80;
        server_name monitor.example.com;

        location / {
            return 301 https://$host$request_uri;
        }
    }

    server {
        listen 443 ssl http2;
        server_name monitor.example.com;

        # SSL Certificates - Paths may vary based on your SSL provider (e.g., Certbot, manual)
        ssl_certificate /etc/letsencrypt/live/monitor.example.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/monitor.example.com/privkey.pem;
        # Ensure your SSL private key is securely stored and protected.

        # Security Headers
        add_header X-Frame-Options "SAMEORIGIN";
        add_header X-Content-Type-Options "nosniff";
        add_header Referrer-Policy "no-referrer-when-downgrade";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload";

        # Optional: Rate limiting to prevent DoS attacks (configure as needed)
        # limit_req_zone $binary_remote_addr zone=one:10m rate=1r/s;
        # location /api {
        #     limit_req zone=one burst=5 nodelay;
        #     # ... proxy_pass configuration ...
        # }

        # Optional: Disable unnecessary HTTP methods
        # if ($request_method !~ ^(GET|POST|HEAD)$) {
        #     return 405;
        # }

        location / {
            # Use Docker service names for proxy_pass if Nginx is on the same host as Docker Compose
            proxy_pass http://frontend-service:3000; # Replace with your frontend service name and port
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
            # Basic caching for static assets (adjust as needed)
            # expires 1d;
            # add_header Cache-Control "public, max-age=86400";
        }

        location /api {
            # Use Docker service names for proxy_pass if Nginx is on the same host as Docker Compose
            proxy_pass http://api-service:3001; # Replace with your API service name and port
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
            # The API service should only be accessible via this reverse proxy.
            # Ensure direct access to the API service port (e.g., 3001) is blocked by a firewall.
        }
    }
    ```
    **Note**:
    *   Replace `frontend-service:3000` and `api-service:3001` with the actual service names and ports defined in your `docker-compose.prod.yml` file. If Nginx is running outside the Docker network, you might need to use the host's IP address and exposed ports.
    *   Ensure direct access to your frontend and API service ports (e.g., 3000, 3001) is blocked by a firewall, allowing traffic only through Nginx on ports 80/443.

3.  **Obtain SSL Certificates**: Use Certbot to obtain free SSL certificates from Let's Encrypt.
    ```bash
    sudo snap install --classic certbot
    sudo certbot --nginx -d monitor.example.com
    ```

4.  **Test Nginx Configuration and Restart**:
    ```bash
    sudo nginx -t
    sudo systemctl reload nginx
    ```

## Securing PostgreSQL and Redis

It is crucial to secure your database and Redis instances, especially in a production environment.
*   **PostgreSQL**:
    *   Use strong, unique passwords for database users.
    *   Configure `pg_hba.conf` to restrict access to trusted IP addresses only.
    *   Consider enabling SSL for database connections.
*   **Redis**:
    *   Set a strong password using the `requirepass` directive in `redis.conf`.
    *   Bind Redis to a specific network interface (e.g., `127.0.0.1` or the Docker network IP) to prevent public access.
    *   Do not expose Redis to the public internet.

## Performance Considerations

*   **Resource Allocation**: Monitor your server's CPU, RAM, and disk I/O. Scale up resources as the number of monitored entities or users increases.
*   **Nginx Caching**: For static assets, consider enabling more aggressive caching in Nginx to reduce load on the frontend service.
*   **Database/Redis Tuning**: For large-scale deployments, research and apply performance tuning best practices for PostgreSQL and Redis.
*   **Load Balancing**: For high availability and scalability, consider deploying multiple instances of the API and frontend services behind a load balancer.

## Testing
Ensure all services are running and accessible. You should be able to access the API and frontend via your configured domain.

## Troubleshooting
- Check container logs: `docker-compose -f docker-compose.prod.yml logs -f`
- **Database/Redis Connection Issues**:
    *   Verify `DATABASE_URL` and `REDIS_URL` in your `.env` file are correct.
    *   Check firewall rules to ensure your application can connect to the database/Redis.
    *   Ensure PostgreSQL and Redis services are running and accessible.
- **Nginx Configuration Issues**:
    *   Verify Nginx configuration with `sudo nginx -t`.
    *   Check Nginx error logs (e.g., `/var/log/nginx/error.log`).
    *   Ensure SSL certificates are valid and correctly configured.
- **Prisma Migrate Deploy Failures**:
    *   Review the error message carefully. It often indicates issues with database connectivity, permissions, or schema conflicts.
    *   Ensure your database is empty or contains a compatible schema if it's a fresh deployment.
    *   Consult Prisma documentation for specific migration troubleshooting.

## Done when
This guide provides a clear and efficient path for users to self-host Argus Monitor, covering essential setup, configuration, and troubleshooting steps.
