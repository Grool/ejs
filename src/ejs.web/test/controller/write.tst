/*
    Test Controller.write*
 */
require ejs.web

const HTTP = App.config.uris.http

public class TestController extends Controller {
    use namespace action

    action function error() {
        writeError(201, "error-msg")
    }
    action function file() {
        writeFile("../utils.es")
    }
    action function index() {
        writeView(null, { layout: null })
    }
    action function viewFile() {
        writeTemplate("list.ejs", { layout: null })
    }
    action function partial() {
        writePartialTemplate("web/part1.ejs", { layout: null })
        writePartialTemplate("web/part2.ejs", { layout: null })
        write()
    }
    action function response() {
        return {status: Http.Ok, headers: { Weather: "raining" }, body: "Hello Response" }
    }
} 

load("../utils.es")
server = controllerServer(HTTP)


//  writeError
let http = fetch(HTTP + "/test/error", 201)
assert(http.response.contains("log.showErrors"))
assert(http.response.contains("error-msg"))
http.close()


//  writeFile
let http = fetch(HTTP + "/test/file")
assert(Path("../utils.es").readString() == http.response)
http.close()


//  writeView
let http = fetch(HTTP + "/test/index")
assert(http.response == "Hello Index\n")
http.close()


//  writeTemplate
let http = fetch(HTTP + "/test/viewFile")
assert(http.response == "Hello View\n")
http.close()


//  writePartialTemplate
let http = fetch(HTTP + "/test/partial")
assert(http.response == "part-1\npart-2\n")
http.close()


//  write a response hash
let http = fetch(HTTP + "/test/response")
assert(http.header("Weather") == "raining")
assert(http.response == "Hello Response")
http.close()

server.close()
