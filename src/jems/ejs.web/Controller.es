/*
    Controller.es -- MVC Controller class.
 */

module ejs.web {

    /* 
        Namespace for all action methods 
     */
    namespace action = "action"

    /** 
        Web framework controller class.
        @stability prototype
        @spec ejs
     */
    class Controller {
        /*  
            Define properties and functions in the ejs.web namespace so that user controller variables don't clash. 
            Override with "public" the specific properties that must be copied to views.
         */
        use default namespace module

//  MOB -- can this be renamed "action" without clashing with "action" namespace?
        /** Name of the action being run */
        var actionName:  String 

//  MOB -- rename to "name"
        /** Lower case controller name */
        var controllerName: String

        /** Deployment mode: debug, test, production */
        var deploymentMode: String

        /** Logger channel */
        var log: Logger

        /** Reference to the Request.params object. This stores the request query and form parameters */
        var params: Object

        /** Reference to the current Request */
        var request: Request

        /** Reference to the current view */
        var view: View

        /** 
            Flash messages to display on the next screen
                "error"         Negative errors (Warnings and errors)
                "inform"        Informational / postitive feedback (note)
                "warn"          Negative feedback (Warnings and errors)
                "*"             Other feedback (reminders, suggestions...)
        */
        public var flash:       Object

        private var rendered:   Boolean
        private var redirected: Boolean
        private var _afterFilters: Array
        private var _beforeFilters: Array
        private var _wrapFilters: Array
        private var lastFlash

        private static var _initRequest: Request

        /** 
            Create and initialize a controller
            @param r Web request object
         */
        function Controller(r: Request) {
            request = r || _initRequest
            log = request.log
            if (request) {
                log = request.log
                params = request.params
                controllerName = typeOf(this).trim("Controller") || "-Controller-"
                if (request.config.database) {
                    openDatabase(request)
                }
            }
        }

        /** 
            Factory method to create and initialize a controller. The controller class is specified by 
            params["controlller"] which should be set to the controller name without the "Controller" suffix. 
            This call expects the controller class to be loaded. 
            @param request Web request object
         */
        static function create(request: Request): Controller {
            let cname: String = request.params["controller"]
            if (!cname) {
                throw "Can't run app, controller " + cname + " is not loaded"
            }
            _initRequest = request
            let uname = cname.toPascal() + "Controller"
            let c = new global[uname](request)
            _initRequest = null
            return c
        }

        /*
            Generic open of a database. Expects and ejscr configuration like:

            mode: "debug"
            database: {
                class: "Database",
                adapter: "sqlite3",
                debug: {
                    name: "db/blog.sdb", trace: true, 
                }
            }
         */
        private function openDatabase(request: Request) {
            let deploymentMode = request.config.mode
            let dbconfig = request.config.database
            let klass = dbconfig["class"]
            let adapter = dbconfig.adapter
            let profile = dbconfig[deploymentMode]
            if (klass && dbconfig.adapter && profile.name) {
                //  MOB -- should NS be here
                use namespace "ejs.db"
                let db = new global[klass](dbconfig.adapter, request.dir.join(profile.name))
                if (profile.trace) {
                    db.trace(true)
                }
            }
        }

        /** 
            Run the controller action. 
            @param request Request object
         */
        function run(request: Request): Void {
            actionName = params.action || "index"
            params.action = actionName
            use namespace action
            if (!this[actionName]) {
                actionName = "missing"
            }
            flashBefore()
            runFilters(_beforeFilters)
            if (!redirected) {
                /* Run the action */
                this[actionName]()
                if (!rendered)
                    renderView()
                runFilters(_afterFilters)
            }
            flashAfter()
            //  MOB -- but what if you don't want a controller to finalize?
            request.finalize()
        }

        /* 
            Prepare the flash message. This extracts any flash message from the session state store
         */
        private function flashBefore() {
            lastFlash = null
            if (session) {
                flash = session["__flash__"]
            }
            if (!flash) {
                flash = {}
            } else {
                if (session) {
                    session["__flash__"] = undefined
                }
                lastFlash = flash.clone()
            }
        }

        /* 
            Save the flash message for the next request. Delete old flash messages
         */
        private function flashAfter() {
            if (lastFlash) {
                for (item in flash) {
                    for each (old in lastFlash) {
                        if (hashcode(flash[item]) == hashcode(old)) {
                            delete flash[item]
                        }
                    }
                }
            }
            if (flash && flash.length > 0) {
                if (session) {
                    session["__flash__"] = flash
                }
            }
        }

        /** @hide TODO */
        function resetFilters(): Void {
            _beforeFilters = null
            _afterFilters = null
            _wrapFilters = null
        }

        /** @hide TODO */
        function beforeFilter(fn, options: Object? = null): Void {
            _beforeFilters ||= []
            _beforeFilters.append([fn, options])
        }

        /** @hide TODO */
        function afterFilter(fn, options: Object? = null): Void {
            _afterFilters ||= []
            _afterFilters.append([fn, options])
        }

        /** @hide TODO */
        function wrapFilter(fn, options: Object? = null): Void {
            _wrapFilters ||= []
            _wrapFilters.append([fn, options])
        }

        /* 
            Run the before/after filters. These are typically used to handle authorization and similar tasks
         */
        private function runFilters(filters: Array): Void {
            for each (filter in filters) {
                let fn = filter[0]
                let options = filter[1]
                if (options) {
                    only = options.only
                    if (only) {
                        if (only is String && actionName != only) {
                            continue
                        }
                        if (only is Array && !only.contains(actionName)) {
                            continue
                        }
                    } 
                    except = options.except
                    if (except) {
                        if (except is String && actionName == except) {
                            continue
                        }
                        if (except is Array && except.contains(actionName)) {
                            continue
                        }
                    }
                }
                fn.call(this)
            }
        }

        /**
            Load the view
         */
        function loadView(path: Path, name: String) {
            let dirs = request.config.directories
            let cached = Loader.cached(path, request.dir.join(dirs.cache))
            if (cached && cached.exists && cached.modified >= path.modified) {
                log.debug(4, "Load view \"" + name + "\" from cache: " + cached);
                load(cached)
            } else {
                if (!global.TemplateParser) {
                    load("ejs.web.template.mod")
                }
                let layouts = request.dir.join(dirs.layouts)
                log.debug(4, "Rebuild and template \"" + name + "\" from cache: " + cached);
                let code = TemplateParser().buildView(name, path.readString(), { layouts: layouts })
                eval(code, cached)
            }
        }

        /**
            Render an error message as the response
         */
        function renderError(msg: String = "", status: Number = Http.ServerError): Void {
            request.writeError(msg, status)
            rendered = true
        }

        /** 
            Redirect to the given action
            @param uri Uri to redirect to 
            @param status Http status code to use in the redirection response. Defaults to 302.
         */
        function redirect(uri: Uri, status: Number = Http.MovedTemporarily): Void {
            request.redirect(uri, status)
            redirected = true
        }

        /** 
            Render the raw arguments back to the client. The args are converted to strings.
         */
        function render(...args): Void { 
            rendered = true
            request.write(args)
            request.finalize()
        }

        /** 
            Render a file's contents. 
         */
        function renderFile(filename: String): Void { 
            rendered = true
            let file: File = new File(filename)
            try {
                //  MOB -- should use SENDFILE
                file.open()
                while (data = file.read(4096)) {
                    request.write(data)
                }
                file.close()
                request.finalize()
            } catch (e: Error) {
                reportError(Http.ServerError, "Can't read file: " + filename, e)
            }
        }

        /** 
            Render a partial ejs template. Does not set "rendered" to true.
         */
        function renderPartial(path: Path): void { 
            //  MOB -- todo
        }

        /** 
            Render a view template
         */
        function renderView(viewName: String? = null): Void {
            if (rendered) {
                throw new Error("renderView invoked but render has already been called")
                return
            }
            rendered = true
            viewName ||= actionName
            let viewClass = controllerName + "_" + viewName + "View"
            if (!global[viewClass]) {
                let path = request.dir.join("views", controllerName, viewName).joinExt(request.config.extensions.ejs)
                loadView(path, controllerName + "_" + viewName)
            }
            view = new global[viewClass](request)
            //  MOB -- slow. Native method for this?
            for each (let n: String in Object.getOwnPropertyNames(this)) {
                if (this.public::[n]) {
                    view.public::[n] = this[n]
                }
            }
            log.debug(4, "render view: \"" + controllerName + "/" + viewName + "\"")
            view.render(request)
        }

        /** 
            Send an error notification to the user. This is just a convenience instead of setting flash["error"]
            @param msg Message to display
         */
        function error(msg: String): Void
            flash["error"] = msg

        /** 
            Send a positive notification to the user. This is just a convenience instead of setting flash["inform"]
            @param msg Message to display
         */
        function inform(msg: String): Void
            flash["inform"] = msg

        /** 
            Send a warning message back to the client for display in the flash area. This is just a convenience instead of
            setting flash["warn"]
            @param msg Message to display
         */
        function warn(msg: String): Void
            flash["warn"] = msg

//  MOB -- revise doc
        /** 
            Make a URI suitable for invoking actions. This routine will construct a URL Based on a supplied action name, 
            model id and options that may contain an optional controller name. This is a convenience routine to remove from 
            applications the burden of building URLs that correctly use action and controller names.
            @params parts 
            @return A string URL.
            @options url An override url to use. All other args are ignored.
            @options query Query string to append to the URL. Overridden by the query arg.
            @options controller The name of the controller to use in the URL.
         */
        function makeUri(parts: Object): Uri
            request.makeUri(parts)

        /** 
            Missing action method. This method will be called if the requested action routine does not exist.
         */
        action function missing(): Void {
            rendered = true
            throw "Missing Action: \"" + params.action + "\" could not be found for controller \"" + controllerName + "\""
        }
    }
}


/*
    @copy   default
    
    Copyright (c) Embedthis Software LLC, 2003-2010. All Rights Reserved.
    Copyright (c) Michael O'Brien, 1993-2010. All Rights Reserved.
    
    This software is distributed under commercial and open source licenses.
    You may use the GPL open source license described below or you may acquire 
    a commercial license from Embedthis Software. You agree to be fully bound 
    by the terms of either license. Consult the LICENSE.TXT distributed with 
    this software for full details.
    
    This software is open source; you can redistribute it and/or modify it 
    under the terms of the GNU General Public License as published by the 
    Free Software Foundation; either version 2 of the License, or (at your 
    option) any later version. See the GNU General Public License for more 
    details at: http://www.embedthis.com/downloads/gplLicense.html
    
    This program is distributed WITHOUT ANY WARRANTY; without even the 
    implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. 
    
    This GPL license does NOT permit incorporating this software into 
    proprietary programs. If you are unable to comply with the GPL, you must
    acquire a commercial license to use this software. Commercial licenses 
    for this software and support services are available from Embedthis 
    Software at http://www.embedthis.com 

    @end
 */
