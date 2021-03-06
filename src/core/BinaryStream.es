/*
    BinaryStream.es -- BinaryStream class. This class is a filter or endpoint stream to encode and decode binary types.
    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

module ejs {

    /** 
        BinaryStreams encode and decode various objects onto streams. A BinaryStream may be stacked atop an underlying stream
        provider such as ByteArray, File, Http or Socket. The underlying stream must be in sync mode.
        @spec ejs
        @stability evolving
     */
    class BinaryStream implements Stream {

        use default namespace public

        /** 
            Big endian byte order 
         */
        static const BigEndian: Number = 0

        /** 
            Little endian byte order 
         */
        static const LittleEndian: Number = 1

        /* 
            Data input and output buffers. The buffers are used to marshall the data for encoding and decoding. The inbuf 
            also hold excess input data. The outbuf is only used to encode data -- no buffering occurs.
         */
        private var inbuf: ByteArray
        private var outbuf: ByteArray
        private var nextStream: Stream
        private var emitter: Emitter

        /** 
            Create a new BinaryStream
            @param stream stream to stack upon.
         */
        function BinaryStream(stream: Stream) {
            if (!stream) {
                throw new ArgError("Must supply a Stream to connect with")
            }
            nextStream = stream
            inbuf = new ByteArray
            outbuf = new ByteArray

            inbuf.on("writable", function (event: String, buffer: ByteArray) {
                nextStream.read(buffer)
            })

            outbuf.on("readable", function (event: String, buffer: ByteArray) {
                count = nextStream.write(buffer)
                buffer.readPosition += count
                buffer.reset()
            })
        }

        /** 
            @duplicate Stream.async 
         */
        function get async(): Boolean
            false

        /** 
            @duplicate Stream.async 
         */
        function set async(enable: Boolean): Void {
            throw "async mode not implemented for BinaryStreams"
        }

        /** 
            @duplicate Stream.close 
         */
        function close(): void
            nextStream.close()

        /** 
            Current encoding scheme for serializing strings. Defaults to "utf-8".
         */
        function get encoding(): String {
            return inbuf.enc
        }

        /** 
            @duplicate BinaryStream.encoding
            @param enc String representing the encoding scheme
         */
        function set encoding(enc: String): Void {
            inbuf.encoding = enc
            outbuf.encoding = enc
        }

        /** 
            Current byte ordering. Set to either LittleEndian or BigEndian.
         */
        function get endian(): Number
            inbuf.endian

        /** 
            Set the system encoding to little or big endian.
            @param value Set to true for little endian encoding or false for big endian.
         */
        function set endian(value: Number): Void {
            if (value != BigEndian && value != LittleEndian) {
                throw new ArgError("Bad endian value")
            }
            inbuf.endian = value
            outbuf.endian = value
        }

        /**
            @duplicate Stream.flush
         */
        function flush(dir: Number = Stream.BOTH): Void {
            if (dir & Stream.READ) 
                inbuf.flush(Stream.READ)
            if (dir & Stream.WRITE) 
                outbuf.flush(Stream.WRITE)
            if (!(nextStream is ByteArray)) {
                /* Don't flush loopback bytearrays */
                nextStream.flush(dir)
            }
        }

        /** 
            The number of bytes available to read without blocking. This is the number of bytes internally buffered
            in the binary stream and does not include any data buffered downstream.
            @return the number of available bytes
         */
        function get length(): Number
            inbuf.length

        /** 
            @duplicate Stream.on 
         */
        function on(name, observer: Function): BinaryStream {
            emitter ||= new Emitter
            emitter.on(name, observer)
            return this
        }

        /** 
            @duplicate Stream.read
         */
        function read(buffer: ByteArray, offset: Number = 0, count: Number = -1): Number?
            inbuf.read(buffer, offset, count)

        /** 
            Read a boolean from the stream.
            @returns a boolean. Returns null on EOF.
            @throws IOError if an I/O error occurs.
         */
        function readBoolean(): Boolean?
            inbuf.readBoolean()

        /** 
            Read a byte from the stream.
            @returns a byte. Returns -1 on EOF.
            @throws IOError if an I/O error occurs.
         */
        function readByte(): Number?
            inbuf.readByte()

        /** 
            Read a date from the stream.
            @returns a date
            @throws IOError if an I/O error occurs or premature EOF
         */
        function readDate(): Date?
            inbuf.readDate()

        /** 
            Read a double from the stream. The data will be decoded according to the encoding property.
            @returns a double
            @throws IOError if an I/O error occurs or premature EOF
         */
        function readDouble(): Double?
            inbuf.readDouble()

        /** 
            Read a 32-bit integer from the stream. The data will be decoded according to the encoding property.
            @returns an 32-bitinteger
            @throws IOError if an I/O error occurs or premature EOF
         */
        function readInteger(): Number?
            inbuf.readInteger()

        /** 
            Read a 64-bit long from the stream.The data will be decoded according to the encoding property.
            @returns a 64-bit long number
            @throws IOError if an I/O error occurs or premature EOF
         */
        function readLong(): Number?
            inbuf.readInteger()

        /** 
            Read a UTF-8 string from the stream. 
            @param count of bytes to read. Returns the entire stream contents if count is -1.
            @returns a string
            @throws IOError if an I/O error occurs or premature EOF.
         */
        function readString(count: Number = -1): String ?
            inbuf.readString(count)

        /** 
            Read an XML document from the stream. This assumes the XML document will be the only data until EOF.
            @returns an XML document
            @throws IOError if an I/O error occurs or premature EOF
         */
        function readXML(): XML? {
            var data: String = ""
            while (1) {
                var s: String? = inbuf.readString()
                if (s == null && data.length == 0) {
                    return null
                }
                if (s.length == 0) {
                    break
                }
                data += s
            }
            return new XML(data)
        }

        /** 
            @duplicate Stream.off 
         */
        function off(name, observer: Function): Void {
            if (emitter) emitter.off(name, observer)
        }

        /** 
            Return the space available for write data. This call can be used to prevent write from blocking or 
            doing partial writes. If it cannot be determined how much room is available, this call will return null.
            @return The number of bytes that can be written without blocking or null if it cannot be determined.
         */
        function room(): Number
            outbuf.room()
       
        /** 
            Write data to the stream. Write intelligently encodes various data types onto the stream and will encode 
            data in a portable cross-platform manner according to the setting of the $endian property. If data is an 
            array, each element of the array will be written. 
            @param items Data items to write. The ByteStream class intelligently encodes various data types according 
            to the current setting of the $endian property. 
            @returns The total number of bytes that were written.
            @throws IOError if there is an I/O error.
            @event 
         */
        function write(...items): Number {
            let count: Number = 0
            for each (i in items) {
                count += outbuf.write(i)
            }
            return count
        }

        /** 
            Write a byte to the array. Data is written to the current write $position pointer.
            @param data Data to write
            @event readable Issued when data is written and a consumer can read without blocking.
         */
        function writeByte(data: Number): Void 
            outbuf.writeByte(outbuf)

        /** 
            Write a short to the array. Data is written to the current write $position pointer.
            @param data Data to write
            @event readable Issued when data is written and a consumer can read without blocking.
         */
        function writeShort(data: Number): Void
            outbuf.writeShort(data)

        /** 
            Write a double to the array. Data is written to the current write $position pointer.
            @param data Data to write
            @event readable Issued when data is written and a consumer can read without blocking.
         */
        function writeDouble(data: Number): Void
            outbuf.writeDouble(data)

        /** 
            Write a 32-bit integer to the array. Data is written to the current write $position pointer.
            @param data Data to write
            @event readable Issued when data is written and a consumer can read without blocking.
         */
        function writeInteger(data: Number): Void
            outbuf.writeInteger(data)

        /** 
            Write a 64 bit long integer to the array. Data is written to the current write $position pointer.
            @param data Data to write
            @event readable Issued when data is written and a consumer can read without blocking.
         */
        function writeLong(data: Number): Void
            outbuf.writeLong(data)
    }
}


/*
    @copy   default

    Copyright (c) Embedthis Software. All Rights Reserved.

    This software is distributed under commercial and open source licenses.
    You may use the Embedthis Open Source license or you may acquire a 
    commercial license from Embedthis Software. You agree to be fully bound
    by the terms of either license. Consult the LICENSE.md distributed with
    this software for full details and other copyrights.

    Local variables:
    tab-width: 4
    c-basic-offset: 4
    End:
    vim: sw=4 ts=4 expandtab

    @end
 */
