# projektvpn
Meshnet-based VPN Hosting System

[See ProjektVPN in Action!](http://projektvpn.com/)

ProjektVPN is a turnkey VPN server hosting solution. It runs on a VPN server which forwards user traffic, and handles the collection of payment and the granting and revocation of access to users.

Payment is accepted in bitcoin using the [Blockr API](http://blockr.io/documentation/api), and the actual VPN functionality is provided by [cjdns](https://github.com/cjdelisle/cjdns), using the [cjdns-admin npm module](https://github.com/tcrowe/cjdns-admin).

This repository holds the server software. The client software is available in [projektvpn-client](https://github.com/projektvpn/projektvpn-client).

## Installation

```
sudo apt-get install curl
curl -sL https://deb.nodesource.com/setup_7.x | sudo -E bash -
sudo apt-get install -y build-essential libczmq-dev mariadb-server nodejs 
git clone https://github.com/projektvpn/projektvpn.git
cd projektvpn
npm install
```

###Set up cjdns:

```
sudo apt-get install mosh nano build-essential nodejs make git devscripts dh-systemd
mkdir cjdns
cd cjdns
git clone https://github.com/cjdelisle/cjdns.git
# Fix service files
cd debian && echo "contrib/systemd/cjdns-resume.service /lib/systemd/system/" >> cjdns.install; cd ..
# Fix systemctl path
sed -i s_/usr/bin/systemctl_`which systemctl`_g contrib/systemd/cjdns-resume.service
debuild
cd ..
sudo dpkg -i cjdns_0.17.1_amd64.deb
```

###Set up MariaDB:

```
sudo mysql --defaults-file=/etc/mysql/debian.cnf

CREATE DATABASE pvpn;

GRANT ALL PRIVILEGES ON pvpn.* to pvpn@'localhost' IDENTIFIED BY 'pvpn-password'; 

quit;

```

### Configure ProjektVPN

Make a `.env` file with the database credentials, cjdns admin credentials, and bitcoin configuration:

```
DB_HOST=localhost
DB_USER=pvpn
DB_PASS=pvpn-password
DB_DATABASE=pvpn
BTC_NETWORK=live
BTC_PAYTO=1YourBtcAddressHere
CJDNS_PUBKEY=yourServerCjdnsPubkeyHere.k
CJDNS_ADMIN_HOST=localhost
CJDNS_ADMIN_PORT=11234
CJDNS_ADMIN_PASS=yourServerCjdnsAdminPasswordHere
```

**Make sure to set the permissions** on the file to be readable only by user.

```
chmod 600 .env
```

The `DB_HOST` and `CJDNS_ADMIN_HOST` default to `localhost`, and the `CJDNS_ADMIN_PORT` defaults to `11234`. The `BIND_ADDRESS` and `BIND_PORT` variables can be used to control where the server runs. They default to `localhost` port `3000`, but for production, without a proxy, you may want to set them to `::` and `80`.

If you're going to directly bind port 80, and you're running as a normal user, you will need to allow nodejs to bind priviliged ports:

```
sudo setcap 'cap_net_bind_service=+ep' `which nodejs`
```

If you want to use Apache as a reverse proxy, you can do something like this:

```
sudo apt-get install apache2
sudo tee /etc/apache2/sites-available/pvpn.conf <<EOF
<VirtualHost *:80>
ServerName projektvpn.com
ServerAlias www.projektvpn.com
DocumentRoot /var/www/html
# Escape these from the shell
#ErrorLog \${APACHE_LOG_DIR}/error.log
#CustomLog \${APACHE_LOG_DIR}/access.log combined
# For better privacy, don't log anything
ErrorLog /dev/null
CustomLog /dev/null combined
# Don't be a forward proxy
ProxyRequests off
ProxyPass / http://localhost:3000/
</VirtualHost>
EOF
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2dissite 000-default
sudo a2ensite pvpn
sudo service apache2 restart
```

### Configure IP routing

By default, ProjektVPN creates a `10.27.75.0/24` subnet where it assigns client IPs. You will need to add `10.27.75.1` as an IP address on your server's `tun0` and configure NAT and routing between there and the Internet. Assuming you get the Internet on eth0, that would look something like:

```
# Tell your system to forward IPv4
echo 'net.ipv4.conf.default.forwarding=1' | sudo tee -a /etc/sysctl.conf

# Configure the IP that your end of the TUN should have
# On some systems you need to use /etc/network/interfaces.tail instead
sudo tee -a /etc/network/interfaces <<EOF
auto tun0
iface tun0 inet static
        address 10.27.75.1
        network 10.27.75.0
        netmask 255.255.255.0
        broadcast 10.27.75.255
EOF

# Set up NAT so all the VPN traffic comes out of this server's Internet IP
# By default we have an "exit 0" we need to remove
sudo sed '/exit 0/d' /etc/rc.local -i
sudo tee -a /etc/rc.local <<EOF
iptables --wait -t nat -A POSTROUTING -o eth0 -j MASQUERADE
iptables --wait -A FORWARD -i eth0 -o tun0 -m state --state RELATED,ESTABLISHED -j ACCEPT
iptables --wait -A FORWARD -i tun0 -o eth0 -j ACCEPT
EOF

# Restart to apply settings
sudo shutdown -r now
```

### Improve Privacy

If you want to improve the privacy properties of your server, you can turn off some logging features. There's no sense leaving extra information laying around.

/etc/pam.d/login (comment this out):
```
# Prints the last login info upon succesful login
# (Replaces the `LASTLOG_ENAB' option from login.defs)
#session    optional   pam_lastlog.so
```

/etc/login.defs (change to "no"):
```
#        
# Enable logging and display of /var/log/faillog login failure info.
# This option conflicts with the pam_tally PAM module.
#        
FAILLOG_ENAB            no
```

And run these commands:
```
# Delete bad login attempts
sudo rm /var/log/btmp
sudo ln -s /dev/null /var/log/btmp
# Delete more bad login attempts
sudo rm /var/log/faillog
sudo ln -s /dev/null /var/log/faillog
# Delete good logins
sudo rm /var/log/wtmp
sudo ln -s /dev/null /var/log/wtmp
# Delete most recent logins
sudo rm /var/log/lastlog
sudo ln -s /dev/null /var/log/lastlog
```

It's also good practice to disable password authentication, **if you have set up ssh keys**.

```
sudo tee -a /etc/ssh/sshd_config <<EOF
PasswordAuthentication no
EOF
```

### Run ProjektVPN

You can run it manually in a screen for an easy, long-running server.

```
screen
npm start
```

For running as a real server, you want something more robust.


## Administration

To get a MariaDB connection:

```
sudo mysql --defaults-file=/etc/mysql/debian.cnf
```

## Troubleshooting

Sometimes cjdns may try and route tunneled packets over links whose MTUs are too small for them. This can be fixed (hopefully) by peering the client directly with the server, or otherwise altering the meshnet route that the tunneled traffic is taking. Sometimes waiting for cjdns to find a better route and/or detect its link MTUs is enough.

Sometimes you may not be able to send any traffic over the tunnel. If you restart the client cjdns, you won't get your IP reassigned, although the server will still respond to your pings on its cjdns IP. Restarting the server cjdns should fix the issue.
