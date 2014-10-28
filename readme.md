Nook - Distributed File System
=====================

# Starting


chunk servers
----------
```output
nookchunk node1
nookchunk node2
nookchunk node3
```

master servers
----------
```output
nookmaster
nookmaster
```

ftp server
----------
```output
sudo nookftp 21
```
or
```output
nooftp 7777
```

# Work with nookfs

Upload file to nookfs
----------
```output
nookcmd upload hello.txt
```

Get list of files from nookfs
----------
```output
nookcmd catalog
```


Download file from noofs
----------
```output
nookcmd download hello.txt
```


Remove file from nookfs
----------
```output
nookcmd remove hello.txt
```

# Ftp access

You can use any ftp client for access to nookfs
I verified in Internet Explorer 8, Google Chrome, Far (ftp plugin), WinSCP




