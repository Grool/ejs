/*
    Server for blocking.tst

    ejs blocking.es PORT
    Echo back received data. Terminate on "\r\n\r\n".
 */

let PORT = App.args[1] || 6701
server = new Socket
server.listen(PORT)

while (sock = server.accept()) {
    data = new ByteArray
    while (sock.read(data)) {
        sock.write("ECHO " + data.toString().trim())
        if (data.toString().contains("\r\n\r\n")) {
            App.exit()
            break
        }
        data.flush()
    }
    sock.close()
}
App.run()
