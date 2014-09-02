import glob
import os
import sys
sys.path.append('/var/www/')
sys.path.append('/home/bbm/')
import paramiko
import urllib2, ftplib
import time
import StringIO

RETRIEVE_METHOD = "ssh" # or "ftp" or "urllib"
MAX_FTP_RETRIES = 5

#source_host = "solo.ncnr.nist.gov"                  #hard-coded
#source_path = "/var/ftp"
#source_port = 22

sources = [
    {"name": "DCS",
     "host_name": "solo.ncnr.nist.gov",
     "host_port": 22,
     "retrieve_method": "ssh",
     "root_dir": "/home/NIST/ncnr/",
     "live_datapath":"livedata",
     #"live_dataname": "livedata.dcs.gz"},
     "live_datafiles": ["live_data.json"]},
     {"name": "NSE",
     "host_name": "echo.ncnr.nist.gov",
     "host_port": 22,
     "retrieve_method": "ssh",
     "root_dir": "/usr/local/nice/server_data/experiments/",
     "live_datapath":"live_data",
     #"live_dataname": "livedata.dcs.gz"},
     "live_datafiles": ["live_data.json"]},
     {"name": "BT7",
     "host_name": "bt7console.ncnr.nist.gov",
     "host_port": 22,
     "retrieve_method": "ssh",
     "root_dir": "/home/NIST/ncnr/",
     "live_datapath":"live_data",
     #"live_dataname": "livedata.dcs.gz"},
     "live_datafiles": ["live_data.json"]},
]

output = {}
output_filelike = {}

#local_path = "/home/bbm/.livedata/DCS/"

dest_host = "webster.ncnr.nist.gov"                    #hard-coded
dest_port = 22

# I have a different key for pushing to webster.
dest_pkey = paramiko.RSAKey(filename='/home/bbm/.ssh/datapushkey')
dest_username = "bbm"


# writing a list of the last file in Javascript format to a file
json_filename = 'live_data.json'


    
for source in sources:
    retrieve_method = source['retrieve_method']
    #live_dataname = source['live_dataname']
    live_datapath = source['live_datapath']
    root_dir = source['root_dir']
    name = source['name']
    source_host = source['host_name']
    source_port = source['host_port']
    #print "live data modified:", source_sftp.file(live_dataname).stat().st_mtime
    output[name] = {}
    for live_dataname in source['live_datafiles']:
        live_data = StringIO.StringIO()
        #live_data = open(os.path.join(local_path, live_dataname), 'wb')
        if retrieve_method == "urllib":       
            req_addr = os.path.join("ftp://" + source_host, live_datapath, live_dataname)
            #req = urllib2.Request(req_addr)
            response = None
            retries = 0
            while retries < MAX_FTP_RETRIES:
                try:
                    response = urllib2.urlopen(req_addr)
                    break
                except:
                    print "failed attempt %d to retrieve %s: trying again" % (retries, req_addr)
                retries += 1
            
                    
            if response is None: continue
            print "retrieved %s" % (req_addr)
            live_data.write(response.read())
        
        elif retrieve_method == "ftp":
            ftp = ftplib.FTP(source_host)
            ftp.login('anonymous')
            ftp.cwd(live_datapath)
            ftp.retrbinary("RETR " + live_dataname, live_data.write)
            ftp.close()
            
        elif retrieve_method == "ssh":
            source_transport = paramiko.Transport((source_host, source_port))
            source_pkey = paramiko.RSAKey(filename="/home/bbm/.ssh/datapullkey")
            source_username = "ncnr"
            source_transport.connect(username=source_username, pkey = source_pkey)
            source_sftp = paramiko.SFTPClient.from_transport(source_transport)
            
            f = source_sftp.open(os.path.join(root_dir, live_datapath, live_dataname))
            response = f.read()
            f.close()
            live_data.write(response)
            
        else:
            print "no valid retrieve_method"
          
        live_data.seek(0) # move back to the beginning of file
        #live_data.close()
        
        files = [live_dataname,]

        # here I import the library that reads in SANS files:
        #from plot_dcs import process_raw_dcs
        #json_data = process_raw_dcs(local_path)
        json_data = live_data    

        output[name][live_dataname] = json_data.read()

# Now initialize the transfer to the destination:    
dest_transport = paramiko.Transport((dest_host, dest_port))
dest_transport.connect(username = dest_username, pkey = dest_pkey)
dest_sftp = paramiko.SFTPClient.from_transport(dest_transport)

for source in sources:   
    name = source['name']
    
    for json_filename in output[name].keys():    
        # now I push that file outside the firewall to webster:
        remotepath = os.path.join('ipeek', 'data', name, json_filename)

        f = dest_sftp.open(remotepath, 'w')
        f.write(output[name][json_filename])
        f.close()

dest_sftp.close()
dest_transport.close()
#print 'Upload done.'
