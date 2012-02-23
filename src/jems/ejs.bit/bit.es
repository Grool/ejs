#!/usr/bin/env ejs

/*
    bit.es -- Build It! -- Embedthis Build It Framework

    Copyright (c) All Rights Reserved. See copyright notice at the bottom of the file.
 */
module embedthis.bit {

require ejs.unix

public class Bit {
    private const VERSION: Number = 0.2

    /*
        Filter for files that look like temp files and should not be installed
     */
    private const TempFilter = /\.makedep$|\.o$|\.pdb$|\.tmp$|\.save$|\.sav$|OLD|\/Archive\/|\/sav\/|\/save\/|oldFiles|\.libs\/|\.nc|\.orig|\.svn|\.git|^\.[a-zA-Z_]|\.swp$|\.new$|\.nc$|.DS_Store/

    //  MOB - organize
    private var appName: String = 'bit'
    private var args: Args
    private var cross: Boolean
    private var currentBitFile: Path
    private var currentPack: String
    private var currentPlatform: String
    private var envSettings: Object
    private var local: Object
    private var localPlatform: String
    private var options: Object = { control: {}}
    private var out: Stream
    private var platforms: Array
    private var rest: Array
    private var src: Path

    private var home: Path
    private var bareBit: Object = { platform: {}, dir: {}, settings: {}, packs: {}, targets: {}, env: {} }
    private var bit: Object = {}
    private var gen: Object
    private var platform: Object
    private var genout: TextStream
    private var generating: String

    private var defaultTargets: Array
    private var selectedTargets: Array

    private var posix = ['macosx', 'linux', 'unix', 'freebsd', 'solaris']
    private var windows = ['win', 'wince']
    private var start: Date
    private var targetsToBuildByDefault = { exe: true, file: true, lib: true, obj: true, script: true }
    private var targetsToBlend = { exe: true, lib: true, obj: true }
    private var targetsToClean = { exe: true, file: true, lib: true, obj: true, script: true }

    private var argTemplate = {
        options: {
            benchmark: { alias: 'b' },
            bit: { range: String },
            build: { range: String, separator: Array },
            config: { alias: 'c', range: String },
            'continue': {},
            debug: {},
            diagnose: { alias: 'd' },
            emulate: { range: String },
            gen: { alias: 'g', range: String, separator: Array, commas: true },
            import: { range: Boolean },
            log: { alias: 'l', range: String },
            out: { range: String },
            pre: { range: String, separator: Array },
            platform: { range: String, separator: Array },
            prefix: { range: String, separator: Array },
            profile: { range: String },
            release: {},
            quiet: { alias: 'q' },
            save: { range: Path },
            'set': { range: String, separator: Array },
            show: { alias: 's'},
            unset: { range: String, separator: Array },
            verbose: { alias: 'v' },
            version: { alias: 'V' },
            why: { alias: 'w' },
            'with': { range: String, separator: Array },
            without: { range: String, separator: Array },
        },
        usage: usage
    }

    function usage(): Void {
        print('\nUsage: bit [options] [targets|actions] ...\n' +
            '  Options:\n' + 
            '    --benchmark                        # Measure elapsed time\n' +
            '    --build file.bit                   # Build the specified bit file\n' +
            '    --config path-to-source            # Configure for building\n' +
            '    --continue                         # Continue on errors\n' +
            '    --debug                            # Same as --profile debug\n' +
            '    --diagnose                         # Emit diagnostic trace \n' +
            '    --emulate os-arch                  # Emulate platform for build tools\n' +
            '    --gen [make|sh|vs|xcode]           # Generate project file\n' + 
            '    --import                           # Import standard bit configuration\n' + 
            '    --log logSpec                      # Save errors to a log file\n' +
            '    --out path                         # Save output to a file\n' +
            '    --profile [debug|release|...]      # Use the build profile\n' +
            '    --pre sourcefile                   # Pre-process a sourcefile\n' +
            '    --platform os-arch                 # Add platform for cross-compilation\n' +
            '    --quiet                            # Quiet operation. Suppress trace \n' +
            '    --save path                        # Save blended bit file\n' +
            '    --set [feature=value]              # Enable and a feature\n' +
            '    --show                             # Show commands executed\n' +
            '    --release                          # Same as --profile release\n' +
            '    --unset feature                    # Unset a feature\n' +
            '    --version                          # Dispay the bit version\n' +
            '    --verbose                          # Trace operations\n' +
            '    --with PACK[-platform][=PATH]      # Build with package at PATH\n' +
            '    --without PACK[-platform]          # Build without a package\n' +
            '')
        let path = Path('product.bit')
        if (path.exists) {
            try {
                b.loadWrapper(Config.LibDir.join('bits/standard.bit'))
                b.loadWrapper(path)
                if (bit.usage) {
                    print('Feature Selection: ')
                    for (let [item,msg] in bit.usage) {
                        print('  --set %-14s %s' % [item + '=value', msg])
                    }
                }
            } catch (e) { print('CATCH: ' + e)}

        }
        App.exit(1)
    }

    function main() {
        let start = new Date
        global._b = this
        args = Args(argTemplate)
        options = args.options
        home = App.dir
        try {
            setup(args)
            if (options.import) {
                import()
                App.exit()
            } 
            if (options.config) {
                configure()
            } 
            process(options.build)
        } catch (e) {
            let msg: String
            if (e is String) {
                App.log.error('' + e + '\n')
            } else {
                App.log.error('' + ((options.diagnose) ? e : e.message) + '\n')
            }
            App.exit(2)
        }
        if (options.benchmark) {
            trace('Benchmark', 'Elapsed time %.2f' % ((start.elapsed / 1000)) + ' secs.')
        }
    }

    /*
        Parse arguments
     */
    function setup(args: Args) {
        if (options.version) {
            print(version)
            App.exit(0)
        }
        if (options.emulate) {
            localPlatform = options.emulate
        } else {
            localPlatform =  Config.OS.toLower() + '-' + Config.CPU
        }
        let [os, arch] = localPlatform.split('-') 
        local = {
            name: localPlatform,
            os: os
            arch: arch,
            like: like(os),
        }
        if (options.debug) {
            options.profile = 'debug'
        }
        if (options.release) {
            options.profile = 'release'
        }
        if (args.rest.contains('configure')) {
            options.config = '.'
        } else if (options.config) {
            args.rest.push('configure')
        }
        if (args.rest.contains('generate')) {
            if (local.like == 'windows') {
                options.gen = ['sh', 'make', 'vs']
            } else {
                options.gen = ['sh', 'make']
            }
        } else if (options.gen) {
            args.rest.push('generate')
        }
        if (args.rest.contains('import')) {
            options.import = true
        }
        if (options.profile && !options.config) {
            App.log.error('Can only set profile when configuring via --config dir')
            usage()
        }
        if (options.log) {
            App.log.redirect(options.log)
            App.mprLog.redirect(options.log)
        }
        out = (options.out) ? File(options.out, 'w') : stdout
        platforms = options.platform || []
        if (platforms[0] != localPlatform) {
            platforms.insert(0, localPlatform)
        }

        /*
            The --set|unset|with|without switches apply to the previous --platform switch
         */
        let platform = localPlatform
        options.control = {}
        let poptions = options.control[platform] = {}
        for (i = 1; i < App.args.length; i++) {
            let arg = App.args[i]
            if (arg == '--platform' || arg == '-platform') {
                platform = App.args[++i]
                poptions = options.control[platform] = {}
            } else if (arg == '--with' || arg == '-with') {
                poptions['with'] ||= []
                poptions['with'].push(App.args[++i])
            } else if (arg == '--without' || arg == '-without') {
                poptions.without ||= []
                poptions.without.push(App.args[++i])
            } else if (arg == '--set' || arg == '-set') {
                poptions.enable ||= []
                poptions.enable.push(App.args[++i])
            } else if (arg == '--unset' || arg == '-unset') {
                poptions.disable ||= []
                poptions.disable.push(App.args[++i])
            }
        }
        selectedTargets = args.rest
    }

    /*  
        Configure and initialize for building. This generates platform specific bit files.
     */
    function configure() {
        this.src = Path(options.config)
        for each (platform in platforms) {
            vtrace('Init', platform)
            currentPlatform = platform
            let [os, arch] = platform.split('-') 
            global.bit = bit = bareBit.clone(true)
            let bits = src.join('bits/standard.bit').exists ?  src.join('bits') : Config.LibDir.join('bits')
            bit.dir.bits = bits;
            bit.dir.src = Path(src)
            bit.dir.top = Path('.')
            bit.platform = { name: platform, os: os, arch: arch, like: like(os) }
            bit.settings.profile = options.profile || 'debug'
            bit.emulating = options.emulate
            /* Read to get settings */
            loadWrapper(bits.join('standard.bit'))
            /* Fix bit.dirs to be paths */
            setTypes()
            loadWrapper(bit.dir.bits.join('os/' + os + '.bit'))
            loadWrapper(src.join('product.bit'))
            applyProfile()
            makeDirsAbsolute()
            applyCommandLineOptions(platform)
            applyEnv()
            expandTokens(bit)
            makePathsAbsolute()
            setTypes()
            setPathEnvVar()
            findPacks()
            makeOutDirs()
            makeBitFile(platform)
            makeBuildConfig(platform)
            cross = true
        }
    }

    /*
        Make a platform specific bit file
     */
    function makeBitFile(platform) {
        nbit = {}
        if (platforms.length > 1 && platform == platforms[0]) {
            nbit.cross = platforms.slice(1)
        }
        blend(nbit, {
            blend : [
                Path(bit.dir.bits.join('standard.bit')).absolute,
                Path(bit.dir.bits.join('os/' + bit.platform.os + '.bit')).absolute,
                Path(src.join('product.bit')).absolute,
            ],
            platform: bit.platform,
            dir: { 
                src: src.absolute,
                top: bit.dir.top,
            },
            settings: bit.settings,
            defaults: {
                '+includes': [ '${dir.inc}' ],
            },
            packs: bit.packs,
        })
        if (envSettings) {
            blend(nbit, envSettings, {combine: true})
        }
        nbit.platform.like = like(bit.platform.os)
        if (bit.dir.bits != Config.LibDir.join('bits')) {
            nbit.dir.bits = bit.dir.bits
        }
        if (bit.env) {
            nbit.env = bit.env
        }
        for (let [tname,target] in bit.targets) {
            if (target.built) {
                nbit.targets ||= {}
                nbit.targets[tname] = { built: true}
            }
        }
        Object.sortProperties(nbit.settings);
        let path: Path = Path(platform).joinExt('bit')
        trace('Generate', path)

        let data = '/*\n    ' + platform + '.bit -- Build ' + nbit.settings.title + ' for ' + platform + 
            '\n    Generated by bit.\n */\n\nBit.load(' + 
            serialize(nbit, {pretty: true, indent: 4, commas: true, quotes: false}) + ')\n'
        path.write(data)

        if (options.show) {
            trace('Configuration', nbit.settings.title + ' for ' + platform + 
                '\nsettings = ' +
                serialize(nbit.settings, {pretty: true, indent: 4, commas: true, quotes: false}) +
                '\npacks = ' +
                serialize(nbit.packs, {pretty: true, indent: 4, commas: true, quotes: false}))
        }
    }

    /*
        Make a (legacy) buildConfig.h file
     */
    function makeBuildConfig(platform) {
        let path = bit.dir.inc.join('buildConfig.h')
        let f = TextStream(File(path, 'w'))
        f.writeLine('/*\n    buildConfig.h -- Build It Configuration Header for ' + platform + '\n\n' +
                '    This header is generated by Bit during configuration.\n' +
                '    You may edit this file, but Bit will overwrite it next\n' +
                '    time configuration is performed.\n */\n')
        writeOldDefinitions(f, platform)
        f.close()

        let path = bit.dir.inc.join('bit.h')
        let f = TextStream(File(path, 'w'))
        f.writeLine('/*\n    bit.h -- Build It Configuration Header for ' + platform + '\n\n' +
                '    This header is generated by Bit during configuration.\n' +
                '    You may edit this file, but Bit will overwrite it next\n' +
                '    time configuration is performed.\n */\n')
        writeDefinitions(f, platform)
        f.close()
    }

    /*
        Create the newer bit.h configuration file
     */
    function writeDefinitions(f: TextStream, platform) {
        let settings = bit.settings

        f.writeLine('#define ' + bit.platform.os.toUpper() + ' 1')
        // f.writeLine('#define BIT_PRODUCT "' + settings.product + '"')
        // f.writeLine('#define BIT_NAME "' + settings.title + '"')
        // f.writeLine('#define BIT_COMPANY "' + settings.company + '"')
        f.writeLine('#define BIT_' + settings.product.toUpper() + ' 1')
        // f.writeLine('#define BIT_VERSION "' + settings.version + '"')
        // f.writeLine('#define BIT_NUMBER "' + settings.buildNumber + '"')

        // f.writeLine('#define BIT_DEBUG ' + (settings.debug ? 1 : 2))
        let ver = settings.version.split('.')
        f.writeLine('#define BIT_MAJOR_VERSION ' + ver[0])
        f.writeLine('#define BIT_MINOR_VERSION ' + ver[1])
        f.writeLine('#define BIT_PATCH_VERSION ' + ver[2])
        f.writeLine('#define BIT_VNUM ' + ((((ver[0] * 1000) + ver[1]) * 1000) + ver[2]))

        f.writeLine('#define BIT_OS "' + bit.platform.os.toUpper() + '"')
        f.writeLine('#define BIT_CPU "' + bit.platform.arch + '"')
        f.writeLine('#define BIT_CPU_ARCH ' + getMprArch(bit.platform.arch))
        // f.writeLine('#define BIT_PROFILE "' + settings.profile + '"')
        f.writeLine('#define BIT_CMD "' + App.args.join(' ') + '"')

        if (bit.platform.like == "posix") {
            f.writeLine('#define BIT_UNIX_LIKE 1')
        } else if (bit.platform.like == "windows") {
            f.writeLine('#define BIT_WIN_LIKE 1')
        }
        for (let [pname, prefix] in bit.prefixes) {
            f.writeLine('#define BIT_PREFIX_' + pname.toUpper() + ' "' + prefix + '"')
        }
        for (let [ename, ext] in bit.ext) {
            f.writeLine('#define BIT_' + ename.toUpper() + ' "' + ext + '"')
        }
        // f.writeLine('#define BIT_CHAR_LEN ' + settings.charlen)
        if (settings.charlen == 1) {
            f.writeLine('#define BIT_CHAR char')
        } else if (settings.charlen == 2) {
            f.writeLine('#define BIT_CHAR short')
        } else if (settings.charlen == 4) {
            f.writeLine('#define BIT_CHAR int')
        }
        for (let [key,value] in bit.settings) {
            if (value is Number) {
                f.writeLine('#define BIT_' + key.toUpper() + ' ' + value)
            } else if (value is Boolean) {
                f.writeLine('#define BIT_' + key.toUpper() + ' ' + (value cast Number))
            } else {
                f.writeLine('#define BIT_' + key.toUpper() + ' "' + value + '"')
            }
        }
        f.write('\n/*\n    Composite Bit Configuration\n */\n#if INFORMATIVE_ONLY\n' +
            serialize(bit, {pretty: true, commas: true, indent: 4, quotes: false}))
        f.write('\n#endif\n')
    }

    function writeOldDefinitions(f: TextStream, platform) {
        let settings = bit.settings

        //  Xcode work-around
        f.writeLine('#undef BLD_LIB_PREFIX')
        f.writeLine('#define BLD_PRODUCT "' + settings.product + '"')
        f.writeLine('#define BLD_NAME "' + settings.title + '"')
        f.writeLine('#define BLD_COMPANY "' + settings.company + '"')
        f.writeLine('#define BLD_' + settings.product.toUpper() + ' 1')
        f.writeLine('#define BLD_VERSION "' + settings.version + '"')
        f.writeLine('#define BLD_NUMBER "' + settings.buildNumber + '"')
        if (settings.charlen) {
            f.writeLine('#define BLD_CHAR_LEN ' + settings.charlen)
        }
        if (settings.charlen == 1) {
            f.writeLine('#define BLD_CHAR char')
        } else if (settings.charlen == 2) {
            f.writeLine('#define BLD_CHAR short')
        } else if (settings.charlen == 4) {
            f.writeLine('#define BLD_CHAR int')
        }
        f.writeLine('#define BLD_DEBUG ' + (settings.profile == 'debug' ? 1 : 0))
        let ver = settings.version.split('.')
        f.writeLine('#define BLD_MAJOR_VERSION ' + ver[0])
        f.writeLine('#define BLD_MINOR_VERSION ' + ver[1])
        f.writeLine('#define BLD_PATCH_VERSION ' + ver[2])
        f.writeLine('#define BLD_VNUM ' + ((((ver[0] * 1000) + ver[1]) * 1000) + ver[2]))
        f.writeLine('#define ' + bit.platform.os.toUpper() + ' 1')
        if (bit.platform.like == "posix") {
            f.writeLine('#define BLD_UNIX_LIKE 1')
        } else if (bit.platform.like == "windows") {
            f.writeLine('#define BLD_WIN_LIKE 1')
        }
        f.writeLine('#define BLD_TYPE "' + settings.profile + '"')
        f.writeLine('#define BLD_CPU "' + bit.platform.arch + '"')
        f.writeLine('#define BIT_CPU_ARCH ' + getMprArch(bit.platform.arch))
        f.writeLine('#define BLD_OS "' + bit.platform.os.toUpper() + '"')
        f.writeLine('#define BLD_CONFIG_CMD "' + App.args.join(' ') + '"')

        //  MOB - this is used in mprModule which does a basename anyway
        f.writeLine('#define BLD_LIB_NAME "' + platform + '/lib' + '"')

        /* Prefixes */
        let base = (settings.name == 'ejs') ? bit.prefixes.productver : bit.prefixes.product
        f.writeLine('#define BLD_CFG_PREFIX "' + bit.prefixes.config + '"')
        f.writeLine('#define BLD_BIN_PREFIX "' + bit.prefixes.bin + '"')
        f.writeLine('#define BLD_DOC_PREFIX "' + base.join('doc') + '"')
        f.writeLine('#define BLD_INC_PREFIX "' + bit.prefixes.include + '"')
        f.writeLine('#define BLD_JEM_PREFIX "' + bit.prefixes.product.join('jems') + '"')
        f.writeLine('#define BLD_LIB_PREFIX "' + bit.prefixes.lib + '"')
        f.writeLine('#define BLD_LOG_PREFIX "' + bit.prefixes.log + '"')
        f.writeLine('#define BLD_MAN_PREFIX "' + base.join('man') + '"')
        f.writeLine('#define BLD_PRD_PREFIX "' + bit.prefixes.product + '"')
        f.writeLine('#define BLD_SAM_PREFIX "' + base.join('samples') + '"')
        f.writeLine('#define BLD_SPL_PREFIX "' + bit.prefixes.spool + '"')
        f.writeLine('#define BLD_SRC_PREFIX "' + bit.prefixes.src + '"')
        f.writeLine('#define BLD_VER_PREFIX "' + bit.prefixes.productver + '"')
        f.writeLine('#define BLD_WEB_PREFIX "' + bit.prefixes.web + '"')

        /* Suffixes */
        //  MOB - migrate to not use "." prefix
        f.writeLine('#define BLD_EXE ".' + bit.ext.exe + '"')
        f.writeLine('#define BLD_SHLIB ".' + bit.ext.shlib + '"')
        f.writeLine('#define BLD_SHOBJ ".' + bit.ext.shobj + '"')
        f.writeLine('#define BLD_LIB ".' + bit.ext.lib + '"')
        f.writeLine('#define BLD_OBJ ".' + bit.ext.obj + '"')

        /* Features */
        if (settings.assert != undefined) {
            f.writeLine('#define BLD_FEATURE_ASSERT ' + (settings.assert ? 1 : 0))
        }
        if (settings.float != undefined) {
            f.writeLine('#define BLD_FEATURE_FLOAT ' + (settings.float ? 1 : 0))
        }
        if (settings.rom != undefined) {
            f.writeLine('#define BLD_FEATURE_ROMFS ' + (settings.rom ? 1 : 0))
        }

        if (settings.auth) {
            if (settings.auth == 'file') {
                f.writeLine('#define BLD_FEATURE_AUTH_FILE 1')
            } else {
                f.writeLine('#define BLD_FEATURE_AUTH_FILE 0')
            }
            if (settings.auth == 'pam' && bit.platform.like == 'posix') {
                f.writeLine('#define BLD_FEATURE_AUTH_PAM 1')
            } else {
                f.writeLine('#define BLD_FEATURE_AUTH_PAM 0')
            }
        }
        if (settings.mdb != undefined) {
            f.writeLine('#define BLD_FEATURE_MDB ' + (settings.mdb ? '1' : '0'))
        }
        if (settings.sdb != undefined) {
            f.writeLine('#define BLD_FEATURE_MDB ' + (settings.sdb ? '1' : '0'))
        }
        if (settings.manager != undefined) {
            f.writeLine('#define BLD_MANAGER "' + settings.manager + '"')
        }
        if (settings.httpPort) {
            f.writeLine('#define BLD_HTTP_PORT ' + settings.httpPort)
        }
        if (settings.sslPort) {
            f.writeLine('#define BLD_SSL_PORT ' + settings.sslPort)
        }
        f.writeLine('#define BLD_CC_DOUBLE_BRACES ' + (settings.hasDoubleBraces ? '1' : '0'))
        f.writeLine('#define BLD_CC_DYN_LOAD ' + (settings.hasDynLoad ? '1' : '0'))
        f.writeLine('#define BLD_CC_EDITLINE ' + (settings.hasLibEdit ? '1' : '0'))
        f.writeLine('#define BLD_CC_MMU ' + (settings.hasMmu ? '1' : '0'))
        f.writeLine('#define BLD_CC_MTUNE ' + (settings.hasMtune ? '1' : '0'))
        f.writeLine('#define BLD_CC_PAM ' + (settings.hasPam ? '1' : '0'))
        f.writeLine('#define BLD_CC_STACK_PROTECTOR ' + (settings.hasStackProtector ? '1' : '0'))
        f.writeLine('#define BLD_CC_SYNC ' + (settings.hasSync ? '1' : '0'))
        f.writeLine('#define BLD_CC_SYNC_CAS ' + (settings.hasSyncCas ? '1' : '0'))
        f.writeLine('#define BLD_CC_UNNAMED_UNIONS ' + (settings.hasUnnamedUnions ? '1' : '0'))
        f.writeLine('#define BLD_CC_WARN_64TO32 ' + (settings.warn64to32 ? '1' : '0'))
        f.writeLine('#define BLD_CC_WARN_UNUSED ' + (settings.warnUnused ? '1' : '0'))

        /* Packs */
        for (let [pname, pack] in bit.packs) {
            if (pname == 'compiler') {
                pname = 'cc'
            }
            if (pack.path) {
                f.writeLine('#define BLD_FEATURE_' + pname.toUpper() + ' 1')
                f.writeLine('#define BLD_' + pname.toUpper() + ' \"' + pack.path + '\"')
            } else {
                f.writeLine('#define BLD_FEATURE_' + pname.toUpper() + ' 0')
            }
        }

/*
        f.writeLine('#define BLD_TUNE MPR_TUNE_' + settings.tune.toUpper())

        if (platforms.length > 1) {
            let host = platforms
        }
    #define BLD_HOST_OS "MACOSX"
    #define BLD_HOST_CPU_ARCH MPR_CPU_IX86
    #define BLD_HOST_CPU "i386"
    #define BLD_HOST_CPU_UPPER "I386"
    #define BLD_HOST_CPU_MODEL "i386"
    #define BLD_HOST_DIST "Apple"
    #define BLD_HOST_DIST_VER "10.7.2"
    #define BLD_HOST_UNIX 1
    #define BLD_HOST_WIN 0
    #define BLD_BUILD_OS "MACOSX"
    #define BLD_BUILD_CPU_ARCH MPR_CPU_IX64
    #define BLD_BUILD_CPU "x86_64"
    #define BLD_BUILD_CPU_UPPER "X86_64"
    #define BLD_BUILD_CPU_MODEL ""
    #define BLD_BUILD_UNIX 1
    #define BLD_BUILD_WIN 0
    #define BLD_ROOT_PREFIX "/"
    #define BLD_PREFIX "/usr"
    #define BLD_BUILD_BIN_DIR "${BLD_OUT_DIR}/bin"
    #define BLD_BUILD_LIB_DIR "${BLD_OUT_DIR}/lib"
    #define BLD_ABS_BUILD_BIN_DIR "/Users/mob/git/mpr/out/bin"
    #define BLD_ABS_BUILD_LIB_DIR "/Users/mob/git/mpr/out/lib"
    #define BLD_FEATURE_ASSERT 1
    #define BLD_FEATURE_DEVICE PocketPC2003
    #define BLD_FEATURE_FLOAT 1
    #define BLD_FEATURE_LEGACY_API 0
    #define BLD_IMPORTS "${BLD_TOP}/src/mprSsl.h ${BLD_TOP}/src/mpr.h  "
    #define BLD_MPR_PRODUCT 1
    #define BLD_HOST_ARCH ".a"
    #define BLD_HOST_EXE ""
    #define BLD_HOST_OBJ ".o"
    #define BLD_HOST_PIOBJ ".o"
    #define BLD_HOST_CLASS ".class"
    #define BLD_HOST_SHLIB ".dylib"
    #define BLD_HOST_SHOBJ ".dylib"
    #define BLD_BUILD_ARCH ".a"
    #define BLD_BUILD_EXE ""
    #define BLD_BUILD_OBJ ".o"
    #define BLD_BUILD_PIOBJ ".o"
    #define BLD_BUILD_CLASS ".class"
    #define BLD_BUILD_SHLIB ".dylib"
    #define BLD_BUILD_SHOBJ ".dylib"

    #define BLD_CROSS "1"
*/
    }

    /*
        Apply command line --with/--without --enable/--disable options
     */
    function applyCommandLineOptions(platform) {
        var poptions = options.control[platform]
        if (!poptions) {
            return
        }
        for each (field in poptions.disable) {
            bit.settings[field] = false
        }
        for each (field in poptions.enable) {
            let [field,value] = field.split('=')
            if (value == 'true') {
                value = true
            } else if (value == 'false') {
                value = false
            } else if (value.isDigit) {
                value = 0 + value
            }
            if (value == undefined) {
                value = true
            }
            bit.settings[field] = value
        }
        for each (field in poptions['with']) {
            let [field,value] = field.split('=')
            if (value) {
                bit.packs[field] = { enable: true, path: Path(value) }
            }
        }
        for each (field in poptions['without']) {
            bit.packs[field] = { enable: false, diagnostic: 'configured --without ' + field }
        }
        for each (field in poptions['prefix']) {
            let [field,value] = field.split('=')
            if (value) {
                bit.prefixes[field] = Path(value)
            }
        }
    }

    let envTools = {
        AR: '+lib',
        CC: '+compiler',
        LD: '+linker',
    }

    let envFlags = {
        CFLAGS:  '+compiler',
        DFLAGS:  '+defines',
        IFLAGS:  '+includes',
        LDFLAGS: '+linker',
    }

    /*
        Examine environment for flags and apply
     */
    function applyEnv() {
        if (!cross) return
        envSettings = { packs: {}, defaults: {} }
        for (let [key, tool] in envTools) {
            let path = App.getenv(key)
            if (path) {
                envSettings.packs[tool] ||= {}
                envSettings.packs[tool].path = path
                envSettings.packs[tool].enable = true
            }
        }
        for (let [flag, option] in envFlags) {
            let value = App.getenv(flag)
            if (value) {
                envSettings.defaults[option] ||= []
                envSettings.defaults[option] += value.replace(/^-I/, '').split(' ')
            }
        }
    }

    /*
        Import pack files
     */
    function import() {
        for (let [pname, pack] in bit.packs) {
            for each (file in pack.imports) {
                vtrace('Import', file)
                if (file.extension == 'h') {
                    cp(file, bit.dir.inc)
                } else {
                    cp(file, bit.dir.lib)
                }
            }
        }
    }

    /*
        Apply the selected build profile
     */
    function applyProfile() {
        if (options.profile && bit.profiles) {
            blend(bit, bit.profiles[options.profile], {combine: true})
        }
    }

    /*
        Search for enabled packs in the system
     */
    function findPacks() {
        vtrace('Search', 'Packages: ' + [bit.required + bit.optional].join(' '))
        let packs = (bit.required + bit.optional).sort().unique()
        for each (pack in bit.required + bit.optional) {
            if (bit.packs[pack] && !bit.packs[pack].enable) {
                continue
            }
            let path = bit.dir.bits.join('packs', pack + '.bit')
            vtrace('Search', 'Pack ' + pack)
            if (!path.exists) {
                for each (d in bit.settings.packs) {
                    path = bit.dir.src.join(d, pack + '.bit')
                    if (path.exists) {
                        break
                    }
                }
            }
            if (path.exists) {
                try {
                    bit.packs[pack] ||= {enable: true}
                    currentPack = pack
                    loadWrapper(path)
                } catch (e) {
                    if (!(e is String)) {
                        App.log.debug(0, e)
                    }
                    let kind = bit.required.contains(pack) ? 'Required' : 'Optional'
                    whyMissing(kind + ' package "' + pack + '" ' + e)
                    bit.packs[pack] = { enable: false, diagnostic: "" + e }
                    if (kind == 'Required') {
                        throw e
                    }
                }
            } else {
                throw "Unknown package " + path
            }
            if (options.verbose) {
                if (bit.packs[pack] && bit.packs[pack].enable && bit.packs[pack].path) {
                    trace('Probe', pack + ' found at ' + bit.packs[pack].path)
                } else {
                    trace('Probe', pack + ' not found')
                }
            }
        }
    }

    /*
        Probe for a file and locate
     */
    public function probe(file: Path, control = {}): Path {
        let path: Path
        if (!file.exists) {
            let search = []
            let dir
            if (dir = bit.packs[currentPack].path) {
                search.push(dir)
            }
            if (control.search) {
                if (!(control.search is Array)) {
                    control.search = [control.search]
                }
                search += control.search
            }
            App.log.debug(2,"Probe for " + file + ' in ' + search)
            for each (let s: Path in search) {
                App.log.debug(2, "Probe for " + s.join(file) + ' exists: ' + s.join(file).exists)
                if (s.join(file).exists) {
                    path = s.join(file)
                    break
                }
            }
            path ||= Cmd.locate(file)
        }
        if (!path) {
            throw 'File ' + file + ' not found for package ' + currentPack
        }
        App.log.debug(2, 'Probe for ' + file + ' found at ' + path)
        if (control.fullpath) {
            return path
        }
        let pat = RegExp('.' + file.toString().replace(/[\/\\]/g, '.') + '$')
        return path.toString().replace(pat, '')
    }

    /*
        Main processing loop. Used for building and generation.
     */
    function process(path: Path) {
        if (!path) {
            let file = findLocalBitFile()
            App.log.debug(1, 'Change directory to ' + file.dirname)
            App.chdir(file.dirname)
            home = App.dir
            path = file.basename
        }
        global.bit = bit = bareBit.clone(true)
        bit.dir.bits = Config.LibDir.join('bits')
        if (options.profile) {
            bit.settings.profile = options.profile
        }
        loadWrapper(path)
        loadModules()
        applyProfile()
        makeDirsAbsolute()

        let startPlatform = bit.platform.os + '-' + bit.platform.arch
        currentPlatform = startPlatform
        this.src = bit.dir.src

        prepBuild()
        build()

        //  MOB - should have a variable for this
        trace('Complete', currentPlatform + '-' + bit.settings.profile)

        /*
            Do any required cross building
         */
        for each (platform in bit.cross) {
            if (platform == startPlatform) continue
            cross = true
            currentPlatform = platform
            process(Path(platform).joinExt('bit'))
        }
    }

    public function loadModules() {
        App.log.debug(2, "Bit Modules: " + serialize(bit.modules, {pretty: true}))
        for each (let module in bit.modules) {
            App.log.debug(2, "Load bit module: " + module)
            global.load(module)
        }
    }

    /*
        Load a bit file
     */
    public function loadWrapper(path) {
        let saveCurrent = currentBitFile
        try {
            currentBitFile = path
            vtrace('Loading', currentBitFile)
            global.load(path)
        } finally {
            currentBitFile = saveCurrent
        }
    }

    /*
        Rebase paths in a bit file object to be relative to the directory containing the bit file
     */
    function rebase(home: Path, list: Array) {
        for (item in list) {
            let value = list[item]
            //  MOB -should this check if value contains ${}
            list[item] = home.join(value)
        }
    }

    /*
        Change paths in a bit file to be relative to the bit file
     */
    function fixup(o) {
        let home = currentBitFile.dirname
        for (i in o.modules) {
            o.modules[i] = home.join(o.modules[i])
        }
        for (i in o['+modules']) {
            o['+modules'][i] = home.join(o['+modules'][i])
        }
        if (o.defaults) {
            //  Functionalize and repeat for internal
            rebase(home, o.defaults.includes)
            rebase(home, o.defaults['+includes'])
            for (let [when,item] in o.defaults.scripts) {
                if (item is String) {
                    o.defaults.scripts[when] = [{ home: home, script: item }]
                } else {
                    item.home ||= home
                }
            }
        }
        if (o.internal) {
            rebase(home, o.internal.includes)
            rebase(home, o.internal['+includes'])
            for (let [when,item] in o.internal.scripts) {
                if (item is String) {
                    o.internal.scripts[when] = [{ home: home, script: item }]
                } else {
                    item.home ||= home
                }
            }
        }
        for (let [tname,target] in o.targets) {
            target.name ||= tname
            target.home ||= home
            if (target.path) {
                if (!target.path.startsWith('${')) {
                    target.path = target.home.join(target.path)
                }
            }
            if (target.includes is Array) {
                for (i in target.includes) {
                    target.includes[i] = home.join(target.includes[i])
                }
            } else if (target.includes is RegExp) {
                ;
            } else if (target.includes) {
                target.includes = home.join(target.includes)
            }
            for (i in target.sources) {
                if (target.sources is Array) {
                    target.sources[i] = home.join(target.sources[i])
                } else if (target.includes is Regexp) {
                    ;
                } else if (target.sources) {
                    target.sources = home.join(target.sources)
                }
            }
            for (i in target.files) {
                if (target.files is Array) {
                    target.files[i] = home.join(target.files[i])
                } else if (target.includes is Regexp) {
                    ;
                } else if (target.files) {
                    target.files = home.join(target.files)
                }
            }
            /* Convert strings scripts into an array of scripts structures */
            for (let [when,item] in target.scripts) {
                if (item is String) {
                    item = { script: item }
                    target.scripts[when] = [item]
                }
                item.home ||= home
            }
            if (target.build) {
                /*
                    Build scripts run at 'build' time. They have a type of 'script' so they run by default 
                 */
                target.scripts ||= {}
                target.scripts['+build'] ||= []
                target.scripts['+build'] += [{ home: home, script: target.build }]
                target.type ||= 'script'
                delete target.build
            }
            if (target.action) {
                /*
                    Actions run at 'build' time. They have a type of 'action' so they do not run by default
                    unless requested as an action on the command line
                 */
                target.scripts ||= {}
                target.scripts['+build'] ||= []
                target.scripts['+build'] += [{ home: home, script: target.action }]
                target.type ||= 'action'
                delete target.action
            }

            /*
                Blend internal for only the targets in this file
             */
            if (o.internal) {
                blend(target, o.internal, {combine: true})
            }
            if (target.inherit) {
                blend(target, o[target.inherit], {combine: true})
            }
        }
    }

    /*
        Load a bit file object
     */
    public function loadInternal(o) {
        let home = currentBitFile.dirname
        fixup(o)
        /* 
            Blending is depth-first. Blend this bit object after loading blend references.
            Save the blend[] property for the current bit object
            Special case for the local plaform bit file to provide early definition of platform and dir properties
         */
        if (bit.dir && !bit.dir.top) {
            if (o.dir) {
                blend(bit.dir, o.dir, {combine: true})
            }
            if (o.platform) {
                blend(bit.platform, o.platform, {combine: true})
            }
            applyCommandLineOptions(localPlatform)
        }
        let toBlend = blend({}, o, {combine: true})
        for each (path in toBlend.blend) {
            bit.BITS = bit.dir.bits
            path = path.expand(bit, {fill: '.'})
            loadWrapper(home.join(path))
        }
        global.bit = blend(bit, o, {combine: true})
        expandTokens(bit)
    }

    function findLocalBitFile() {
        let name = Path(localPlatform + '.bit').joinExt('bit')
        let base: Path = currentBitFile || '.'
        for (let d: Path = base; d.parent != d; d = d.parent) {
            let f: Path = d.join(name)
            if (f.exists) {
                return f
            }
        }
        throw 'Can\'t find ' + name + '. Run "configure" or "bit config" first.'
/*
    UNUSED
        if (!options.config) {
        }
 */
        return null
    }

    /*
        Generate projects
     */
    function generate() {
        selectedTargets = defaultTargets
        if (generating) return
        gen = {
            compiler:   bit.defaults.compiler.join(' '),
            defines:    bit.defaults.defines.join(' '),
            includes:   bit.defaults.includes.map(function(e) '-I' + e).join(' '),
            linker:     bit.defaults.linker.join(' '),
            libraries:  mapLibs(bit.defaults.libraries).join(' ')
        }
        let base = bit.dir.projects.join(localPlatform + '-' + bit.settings.profile)
        for each (item in options.gen) {
            generating = item
            trace('Generate', 'project file: ' + base.relative + '.' + generating)
            if (generating == 'sh') {
                generateShell(base)
            } else if (generating == 'make') {
                generateMake(base)
            } else if (generating == 'vstudio' || generating == 'vs') {
                generateVstudio(base)
            } else if (generating == 'xcode') {
                generateXcode(base)
            } else {
                throw 'Unknown generation format: ' + generating
            }
            for each (target in bit.targets) {
                target.built = false
            }
        }
        generating = null
    }

    function generateShell(base: Path) {
        let path = base.joinExt('sh')
        genout = TextStream(File(path, 'w'))
        genout.writeLine('#\n#   build.sh -- Build It Shell Script to build ' + bit.settings.title + '\n#\n')
        genout.writeLine('CC="' + bit.packs.compiler.path + '"')
        genout.writeLine('CFLAGS="' + gen.compiler + '"')
        genout.writeLine('DFLAGS="' + gen.defines + '"')
        genout.writeLine('IFLAGS="' + bit.defaults.includes.map(function(path) '-I' + path.relative).join(' ') + '"')
        genout.writeLine('LDFLAGS="' + gen.linker + '"')
        genout.writeLine('LIBS="' + gen.libraries + '"\n')
        genEnv()
        build()
        genout.close()
    }

    function generateMake(base: Path) {
        let path = base.joinExt('mk')
        genout = TextStream(File(path, 'w'))
        genout.writeLine('#\n#   build.mk -- Build It Makefile to build ' + bit.settings.title + 
            ' for ' + bit.platform.os + ' on ' + bit.platform.arch + '\n#\n')
        genout.writeLine('CC        := ' + bit.packs.compiler.path)
        genout.writeLine('CFLAGS    := ' + gen.compiler)
        genout.writeLine('DFLAGS    := ' + gen.defines)
        genout.writeLine('IFLAGS    := ' + bit.defaults.includes.map(function(path) '-I' + path.relative).join(' '))
        genout.writeLine('LDFLAGS   := ' + gen.linker)
        genout.writeLine('LIBS      := ' + gen.libraries + '\n')
        genEnv()
        genout.writeLine('all: \\\n        ' + genAll() + '\nclean:')
        action('cleanTargets')
        genout.writeLine('')
        build()
        genout.close()
    }

    function generateVstudio(base: Path) {
        mkdir(base)
        global.load(bit.dir.bits.join('vstudio.es'))
        vstudio(base)
    }

    function generateXcode(base: Path) {
        mkdir(base)
        global.load(bit.dir.bits.join('xcode.es'))
        xcode(base)
    }

    function genEnv() {
        for (let [key,value] in bit.env) {
            if (value is Array) {
                value = value.join(App.SearchSeparator)
            }
            if (generating == 'make') {
                genout.writeLine('export ' + key + ' := ' + value)
            } else if (generating == 'sh') {
                genout.writeLine('export ' + key + '="' + value + '"')
            }
        }
    }

    function genAll() {
        let all = []
        for each (tname in selectedTargets) {
            let target = bit.targets[tname]
            if (target.path && target.enable) {
                all.push(target.path.relative)
            }
        }
        return all.join(' \\\n        ') + '\n'
    }

    function import() {
        if (Path('bits').exists) {
            throw 'Current directory already contains a bits directory'
        }
        cp(Config.LibDir.join('bits'), 'bits')
        if (!Path('product.bit').exits) {
            mv('bits/sample.bit', 'product.bit')
        }
        print('Initialization complete.')
        print('Edit product.bit and run "bit configure" to prepare for building.')
        print('Then run "bit" to build.')
    }

    function prepBuild() {
        if (!bit.dir.inc.join('buildConfig.h').exists && args.rest[0] != 'clobber') {
            throw 'Can\'t load buildConfig.h. Run configure or "bit configure".'
        }
        setTypes()
        expandTokens(bit)
        setConstVars()
        expandTokens(bit)
        makePathsAbsolute()
        applyCommandLineOptions(currentPlatform)
        applyEnv()
        enableTargets()
        selectTargets()
        blendDefaults()
        resolveDependencies()
        expandWildcards()
        setTargetPaths()
        setTypes()
        setPathEnvVar()
        makeOutDirs()
        Object.sortProperties(bit);

        if (options.save) {
            delete bit.blend
            options.save.write(serialize(bit, {pretty: true, commas: true, indent: 4, quotes: false}))
            trace('Save', 'Combined Bit files to: ' + options.save)
            App.exit()
        }
        trace('Build', currentPlatform + '-' + bit.settings.profile + ': ' + 
                ((selectedTargets != '') ? selectedTargets: 'nothing to do'))
    }

    /*
        Determine which targets are enabled for building on this platform
     */
    function enableTargets() {
        for (let [tname, target] in bit.targets) {
            if (target.enable) {
                if (!(target.enable is Boolean)) {
                    let script = target.enable.expand(bit, {fill: ''}).replace(/\\/g, '\\\\')
                    if (!eval(script)) {
                        vtrace('Skip', 'Target ' + tname + ' is disabled on this platform') 
                        target.enable = false
                    } else {
                        target.enable = true
                    }
                }
                target.name ||= tname
            } else if (target.enable == undefined) {
                target.enable = true
            }
            if (target.platforms) {
                if (!target.platforms.contains(currentPlatform) &&
                    !(currentPlatform == localPlatform && target.platforms.contains('local')) &&
                    !(currentPlatform != localPlatform && target.platforms.contains('cross'))) {
                        target.enable = false
                }
            }
        }
    }

    /*
        Select the targets to build 
     */
    function selectTargets() {
        defaultTargets = []
        for (let [tname,target] in bit.targets) {
            if (targetsToBuildByDefault[target.type]) {
                defaultTargets.push(tname)
            }
        }
        if (selectedTargets.length == 0) {
            /* No targets specified, so do a default "build" */
            selectedTargets = defaultTargets

        } else {
            /* Targets specified. If "build" is one of the targets|actions, expand it to explicit target names */
            let index = selectedTargets.indexOf('build')
            if (index >= 0) {
                let names = []
                for (let [tname,target] in bit.targets) {
                    if (targetsToBuildByDefault[target.type]) {
                        names.push(tname)
                    }
                }
                selectedTargets.splice(index, 1, ...names)
            }
        }
        if (!options.config) {
            selectedTargets = selectedTargets.sort()
        }
        for (let [index, name] in selectedTargets) {
            /* Select target by target type */
            let add = []
            for each (t in bit.targets) {
                if (t.type == name) {
                    if (!selectedTargets.contains(t.name)) {
                        add.push(t.name)
                    }
                    break
                }
            }
            if (!bit.targets[name] && add.length == 0) {
                throw 'Unknown target ' + name
            }
            selectedTargets += add
        }
        vtrace('Targets', selectedTargets)
    }

    /*
        Set target output paths. Uses the default locations for libraries, executables and files
     */
    function setTargetPaths() {
        for each (target in bit.targets) {
            if (!target.path) {
                if (target.type == 'lib') {
                    /* Use addition rather than joinExt because joinExt wont work for names with embedded periods */
                    target.path = bit.dir.lib.join(target.name) + '.' + bit.ext.shobj
                } else if (target.type == 'obj') {
                    target.path = bit.dir.obj.join(target.name) + '.' + bit.ext.obj
                } else if (target.type == 'exe') {
                    target.path = bit.dir.bin.join(target.name) + '.' + bit.ext.exe
                } else if (target.type == 'file') {
                    target.path = bit.dir.lib.join(target.name)
                }
            }
            if (target.path) {
                target.path = Path(target.path.toString().expand(bit, {fill: '${}'}))
            }
        }
    }

    /*
        Build a file list and apply include/exclude filters
     */
    function buildFileList(include, exclude = null)
    {
        let files
        if (include is RegExp) {
            //  MOB - should be relative to the bit file that created this
            files = Path(src).glob('*', {include: include})
        } else {
            if (!(include is Array)) {
                include = [ include ]
            }
            files = []
            for each (pattern in include) {
                files += Path('.').glob(pattern)
            }
        }
        if (exclude) {
            if (exclude is RegExp) {
                files = files.reject(function (elt) elt.match(exclude)) 
            } else if (exclude is Array) {
                for each (pattern in exclude) {
                    files = files.reject(function (elt) { return elt.match(pattern); } ) 
                }
            } else {
                files = files.reject(function (elt) elt.match(exclude))
            }
        }
        return files
    }

    /*
        Resolve a target by inheriting dependent libraries
     */
    function resolve(target) {
        if (target.resolved) {
            return
        }
        target.resolved = true
        for each (dname in target.depends) {
            let dep = bit.targets[dname]
            if (dep) {
                if (!dep.enable) continue
                if (!dep.resolved) {
                    resolve(dep)
                }
                if (dep.type == 'lib') {
                    target.libraries
                    target.libraries ||= []
                    target.libraries.push(dname.replace(/^lib/, ''))
                    for each (lib in dep.libraries) {
                        if (!target.libraries.contains(lib)) {
                            target.libraries.push(lib)
                        }
                    }
                    for each (option in dep.linker) {
                        target.linker ||= []
                        if (!target.linker.contains(option)) {
                            target.linker.push(option)
                        }
                    }
                }
            } else {
                let pack = bit.packs[dname]
                if (pack) {
                    if (!pack.enable) continue
                    if (pack.includes) {
                        target.includes ||= []
                        target.includes += pack.includes
                    }
                    if (pack.defines) {
                        target.defines ||= []
                        target.defines += pack.defines
                    }
                    if (pack.libraries) {
                        target.libraries ||= []
                        target.libraries += pack.libraries
                    }
                    if (pack.linker) {
                        target.linker ||= []
                        target.linker += pack.linker
                    }
                }
            }
        }
        runScript(target, 'preresolve')
    }

    function resolveDependencies() {
        for each (target in bit.targets) {
            resolve(target)
        }
        for each (target in bit.targets) {
            delete target.resolved
        }
    }

    /*
        Expand target.sources and target.headers. Support include+exclude and create target.files[]
     */
    function expandWildcards() {
        let index
        for each (target in bit.targets) {
            runScript(target, 'presource')
            if (target.files) {
                target.files = buildFileList(target.files)
            }
            if (target.sources) {
                target.files ||= []
                let files = buildFileList(target.sources, target.exclude)
                for each (file in files) {
                    /*
                        Create a target for each source file
                     */
                    let obj = bit.dir.obj.join(file.replaceExt(bit.ext.obj).basename)
                    let objTarget = { name : obj, enable: true, path: obj, type: 'obj', files: [ file ], 
                        compiler: target.compiler, defines: target.defines, includes: target.includes }
                    if (bit.targets[obj]) {
                        objTarget = blend(bit.targets[objTarget.name], objTarget, {combined: true})
                    } else {
                        bit.targets[objTarget.name] = objTarget
                    }
                    target.files.push(obj)
                    target.depends ||= []
                    target.depends.push(obj)

                    objTarget.depends = makeDepends(objTarget)
                    for each (header in objTarget.depends) {
                        if (!bit.targets[header]) {
                            bit.targets[header] = { name: header, enable: true, path: header, 
                                type: 'header', files: [ header ] }
                        }
                    }
                }
            }
        }
    }

    /*
        Blend bit.defults into targets
     */
    function blendDefaults() {
        if (bit.defaults) {
            runScript(bit.defaults.scripts, 'preblend')
        }
        let defaults = {}
        for (name in bit.defaults) {
            defaults['+' + name] = bit.defaults[name]
        }
        for each (target in bit.targets) {
            if (targetsToBlend[target.type]) {
                blend(target, defaults, {combine: true})
                runScript(target.scripts, 'postblend')
                if (target.scripts && target.scripts.preblend) {
                    delete target.scripts.preblend
                }
                if (target.type == 'obj') { 
                    delete target.linker 
                    delete target.libraries 
                }
            }
        }
    }

    /*
        Make directories absolute. This allows them to be used by any other bit file.
     */
    function makeDirsAbsolute() {
        for (let [key,value] in bit.dir) {
            bit.dir[key] = Path(value).absolute
        }
        if (bit.defaults) {
            for (let [key,value] in bit.defaults.includes) {
                bit.defaults.includes[key] = Path(value).absolute
            }
        }
    }

    /*
        Make target paths absolute
     */
    function makePathsAbsolute() {
        for (let [key,value] in bit.blend) {
            bit.blend[key] = Path(value).absolute
        }
        for each (target in bit.targets) {
            if (target.path) {
                target.path = Path(target.path).absolute
            }
        }
    }

    /*
        Set types of bit fields. This ensures paths are Paths. 
        NOTE: this is called multiple times during the blending process
     */
    function setTypes() {
        for (let [key,value] in bit.dir) {
            bit.dir[key] = Path(value)
        }
        for each (target in bit.targets) {
            if (target.path) {
                target.path = Path(target.path)
            }
        }
        for each (pack in bit.packs) {
            if (pack.dir) {
                pack.dir = Path(pack.dir)
            }
            if (pack.path) {
                pack.path = Path(pack.path)
            }
            for (i in pack.includes) {
                pack.includes[i] = Path(pack.includes[i])
            }
        }
        for (let [pname, prefix] in bit.prefixes) {
            bit.prefixes[pname] = Path(prefix)
        }
    }

    /*
        Build all selected targets
     */
    function build() {
        for each (name in selectedTargets) {
            let target = bit.targets[name]
            if (target && target.enable) {
                buildTarget(target)
            }
            for each (t in bit.targets) {
                if (t.type == name && t.enable) {
                    buildTarget(t)
                }
            }
        }
    }

    /*
        Build a target and all required dependencies (first)
     */
    function buildTarget(target) {
        if (target.built || !target.enable) {
            return
        }
        bit.target = target
        target.linker ||= []
        target.includes ||= []
        target.libraries ||= []

        runScript(target.scripts, 'predependencies')
        for each (dname in target.depends) {
            let dep = bit.targets[dname]
            if (!dep) {
                if (dname == 'build') {
                    for each (tname in defaultTargets) {
                        buildTarget(bit.targets[tname])
                    }
                } else if (!Path(dname).exists) {
                    if (!bit.packs[dname]) {
                        print('Unknown dependency "' + dname + '" in target "' + target.name + '"')
                        return
                    }
                }
            } else {
                if (!dep.enable || dep.built) {
                    continue
                }
                buildTarget(dep)
            }
        }
        if (target.message) {
            trace('Info', target.message)
        }
        bit.target = target
        if (target.type == 'lib') {
            buildLib(target)
        } else if (target.type == 'exe') {
            buildExe(target)
        } else if (target.type == 'obj') {
            buildObj(target)
        } else if (target.type == 'file') {
            buildFile(target)
        } else if (target.type == 'script') {
            buildScript(target)
        } else if (target.scripts && target.scripts['build']) {
            buildScript(target)
        } else if (target.type == 'generate') {
            generate()
        }
        target.built = true
    }

    /*
        Build an executable program
     */
    function buildExe(target) {
        if (!stale(target)) {
            whySkip(target.path, 'is up to date')
            return
        }
        // diagnose('Building:\n' + target.path + ' = ' + serialize(target, {pretty: true}))
        if (options.diagnose) {
            dump('TARGET', target)
        }
        runScript(target.scripts, 'prebuild')

        let transition = target.rule || 'exe'
        let rule = bit.rules[transition]
        if (!rule) {
            throw 'No rule to build target ' + target.path + ' for transition ' + transition
            return
        }
        setRuleVars(target, 'exe')

        /* Double expand so rules tokens can use ${OUT} */
        let command = rule.expand(bit, {fill: ''})
        command = command.expand(bit, {fill: ''})
        diagnose(2, command)
        if (generating == 'sh') {
            command = genReplace(command)
            genout.writeLine(command + '\n')
        } else if (generating == 'make') {
            command = genReplace(command)
            genout.writeLine(target.path.relative + ': ' + getTargetDeps(target) + '\n\t' + command + '\n')
        } else {
            trace('Link', target.name)
            let cmd = runCmd(command)
            if (cmd.status != 0) {
                throw 'Build failure for ' + target.path + '\n' + cmd.error + "\n" + cmd.response
            }
        }
    }

    /*
        Build a library
     */
    function buildLib(target) {
        if (!stale(target)) {
            whySkip(target.path, 'is up to date')
            return
        }
        if (options.diagnose) {
            dump('TARGET', target)
        }
        runScript(target.scripts, 'prebuild')

        buildSym(target)
        let transition = target.rule || 'lib'
        let rule = bit.rules[transition]
        if (!rule) {
            throw 'No rule to build target ' + target.path + ' for transition ' + transition
            return
        }
        setRuleVars(target, 'lib')

        /* Double expand so rules tokens can use ${OUT} */
        let command = rule.expand(bit, {fill: ''})
        command = command.expand(bit, {fill: ''})
        if (generating == 'sh') {
            command = genReplace(command)
            genout.writeLine(command + '\n')
        } else if (generating == 'make') {
            command = genReplace(command)
            genout.writeLine(target.path.relative + ': ' + getTargetDeps(target) + '\n\t' + command + '\n')
        } else {
            trace('Link', target.name)
            let cmd = runCmd(command)
            if (cmd.status != 0) {
                throw 'Build failure for ' + target.path + '\n' + cmd.error + "\n" + cmd.response
            }
        }
    }

    /*
        Build symbols file for windows libraries
     */
    function buildSym(target) {
        let rule = bit.rules['sym']
        if (!rule || generating) {
            return
        }
        bit.IN = target.files.join(' ')
        /* Double expand so rules tokens can use ${OUT} */
        let command = rule.expand(bit, {fill: ''})
        command = command.expand(bit, {fill: ''})
        trace('Symbols', target.name)
        let cmd = runCmd(command, {noshow: true})
        if (cmd.status != 0) {
            throw 'Build failure for ' + target.path + '\n' + cmd.error + "\n" + cmd.response
        }
        let data = cmd.response
        let result = []
        let lines = data.match(/SECT.*External *\| .*/gm)
        for each (l in lines) {
            if (l.contains('__real')) continue
            let sym = l.replace(/.*\| _/, '').replace(/\r$/,'')
            result.push(sym)
        }
        let def = Path(target.path.toString().replace(/dll$/, 'def'))
        def.write('LIBRARY ' + target.name + '.dll\nEXPORTS\n  ' + result.sort().join('\n  '))
    }

    /*
        Build an object from source
     */
    function buildObj(target) {
        if (!stale(target)) {
            return
        }
        if (options.diagnose) {
            dump('TARGET', target)
        }
        runScript(target.scripts, 'prebuild')

        let ext = target.path.extension
        for each (file in target.files) {
            let transition = file.extension + '->' + target.path.extension
            let rule = target.rule || bit.rules[transition]
            if (!rule) {
                rule = bit.rules[target.path.extension]
                if (!rule) {
                    throw 'No rule to build target ' + target.path + ' for transition ' + transition
                    return
                }
            }
            setRuleVars(target, 'obj', file)
            bit.PREPROCESS = ''
            bit.OUT = target.path
            bit.IN = file
            bit.CFLAGS = (target.compiler) ? target.compiler.join(' ') : ''
            bit.DEFINES = (target.defines) ? target.defines.join(' ') : ''
            bit.INCLUDES = (target.includes) ? target.includes.map(function(path) '-I' + path.relative) : ''
            bit.ARCH = bit.platform.arch

            let command = rule.expand(bit, {fill: ''})

            if (generating == 'sh') {
                command = genReplace(command)
                genout.writeLine(command + '\n')
            } else if (generating == 'make') {
                command = genReplace(command)
                genout.writeLine(target.path.relative + ': \\\n        ' + 
                    file.relative + getTargetDeps(target) + '\n\t' + command + '\n')
            } else {
                trace('Compile', file.relativeTo('.'))
                let cmd = runCmd(command)
                if (cmd.status != 0) {
                    throw 'Build failure for ' + target.path + '\n' + cmd.error + "\n" + cmd.response
                }
            }
        }
    }

    /*
        Copy files[] to path
     */
    function buildFile(target) {
        //  MOB - if target.path is a directory, then stale should check path.join(file)
        if (!stale(target)) {
            whySkip(target.path, 'is up to date')
            return
        }
        runScript(target.scripts, 'prebuild')
        //  MOB - need a way to set or preserve perms
        for each (let file: Path in target.files) {
            trace('Copy', file.relativeTo('.'))
            if (generating == 'sh') {
                genout.writeLine('rm -f ' + target.path + '\n')
                genout.writeLine('cp ' + file + ' ' + target.path + '\n')
            } else if (generating == 'make') {
                genout.writeLine(target.path + ': ' + getTargetDeps(target) + '\n')
                genout.writeLine('\trm -f ' + target.path + '\n')
                genout.writeLine('\tcp ' + file + ' ' + target.path + '\n')
            } else {
                safeRemove(target.path)
                cp(file, target.path)
            }
        }
    }

    /*
        This is for scripts with a 'when' == 'build'
     */
    function buildScript(target) {
        if (!stale(target)) {
            whySkip(target.path, 'is up to date')
            return
        }
        if (options.diagnose) {
            dump('TARGET', target)
        }
        bit.ARCH = bit.platform.arch
        trace(target.type.toPascal(), target.name)
        if (generating == 'sh') {
            genout.writeLine('#  Omit script ' + target.path + ' ' + target.scripts[build])
        } else {
            runScript(target.scripts, 'build')
        }
    }

    /*
        Replace default defines, includes, libraries etc with token equivalents. This allows
        Makefiles and script to be use variables to control various flag settings.
     */
    function genReplace(command: String): String {
        if (generating == 'make') {
            command = command.replace(gen.compiler, '$(CFLAGS)')
            command = command.replace(gen.defines, '$(DFLAGS)')
            command = command.replace(gen.includes, '$(IFLAGS)')
            command = command.replace(gen.libraries, '$(LIBS)')
            command = command.replace(gen.linker, '$(LDFLAGS)')
            command = command.replace(bit.packs.compiler.path, '$(CC)')
        } else if (generating == 'sh') {
            command = command.replace(gen.compiler, '${CFLAGS}')
            command = command.replace(gen.defines, '${DFLAGS}')
            command = command.replace(gen.includes, '${IFLAGS}')
            command = command.replace(gen.libraries, '${LIBS}')
            command = command.replace(gen.linker, '${LDFLAGS}')
            command = command.replace(bit.packs.compiler.path, '${CC}')
        }
        command = command.replace(RegExp(bit.dir.top + '/', 'g'), '')
        command = command.replace(/  */g, ' ')
        return command
    }

    /*
        Get the dependencies of a target as a string
     */
    function getTargetDeps(target): String {
        let deps = []
        for each (let dname in target.depends) {
            let dep = bit.targets[dname]
            if (dep && dep.enable) {
                deps.push(dep.path.relative)
            }
        }
        return ' \\\n        ' + deps.join(' \\\n        ')
    }

    /*
        Set top level constant variables. This enables them to be used in token expansion
     */
    function setConstVars() {
        bit.ARCH = bit.platform.arch
        if (bit.ext.exe) {
            bit.EXE = '.' + bit.ext.exe
        } else {
            bit.EXE = ''
        }
        bit.OBJ = '.' + bit.ext.obj
        bit.SHOBJ = '.' + bit.ext.shobj
        bit.SHLIB = '.' + bit.ext.shlib

        bit.CFG = bit.dir.cfg
        bit.BIN = bit.dir.bin
        bit.BITS = bit.dir.bits
        bit.FLAT = bit.dir.flat
        bit.INC = bit.dir.inc
        bit.LIB = bit.dir.lib
        bit.OBJ = bit.dir.obj
        bit.PACKS = bit.dir.packs
        bit.PKG = bit.dir.pkg
        bit.REL = bit.dir.rel
        bit.SRC = bit.dir.src
        bit.TOP = bit.dir.top
        bit.OS = bit.platform.os
        bit.ARCH = bit.platform.arch
        bit.PLATFORM = bit.platform.name
        bit.LIKE = bit.platform.like
        for each (name in ["ARCH", "BIN", "CFG", "FLAT", "INC", "LIB", "LIKE", "OBJ", "OS", "PACKS", "PKG", "PLATFORM",
                "REL", "SHLIB", "SHOBJ", "SRC", "TOP"]) {
            global[name] = bit[name]
        }
    }

    /*
        Set essential bit variables for build rules
     */
    function setRuleVars(target, kind, file = null) {
        bit.OUT = target.path
        if (kind == 'exe') {
            bit.IN = target.files.join(' ')
            bit.LIBS = mapLibs(target.libraries)
        } else if (kind == 'lib') {
            bit.OUT = target.path
            bit.LIBNAME = target.path.basename
            bit.IN = target.files.join(' ')
            bit.DEF = Path(target.path.toString().replace(/dll$/, 'def'))
            bit.LIBS = mapLibs(target.libraries)
        } else if (kind == 'obj') {
            bit.IN = file
            bit.CFLAGS = (target.compiler) ? target.compiler.join(' ') : ''
            bit.DEFINES = (target.defines) ? target.defines.join(' ') : ''
            bit.INCLUDES = (target.includes) ? target.includes.map(function(e) '-I' + e) : ''
        }
    }

    /*
        Set the PATH and LD_LIBRARY_PATH environment variables
     */
    function setPathEnvVar() {
        outbin = Path('.').join(localPlatform + '-' + bit.settings.profile, 'bin').absolute
        bitbin = bit.dir.bits.join('bin')
        let sep = App.SearchSeparator
        if (generating) {
            outbin = outbin.relative
            bitbin = bitbin.relative
        }
        if (generating == 'make') {
            if (local.os == 'WIN') sep = ';'
            genout.writeLine('export PATH := ' + outbin + sep + bitbin + sep + '${PATH}')
            if (Config.OS == 'MACOSX') {
                genout.writeLine('export DYLD_LIBRARY_PATH := ' + outbin + sep + bitbin + sep + '${DYLD_LIBRARY_PATH}')
            } else {
                genout.writeLine('export LD_LIBRARY_PATH := ' + outbin + sep + bitbin + sep + '${LD_LIBRARY_PATH}')
            }
            genout.writeLine('')
        } else if (generating == 'sh') {
            if (local.os == 'WIN') sep = ';'
            genout.writeLine('export PATH="' + outbin + sep + bitbin + sep + '${PATH}' + '"')
            if (Config.OS == 'MACOSX') {
                genout.writeLine('export DYLD_LIBRARY_PATH="' + outbin + sep + bitbin + sep + '${DYLD_LIBRARY_PATH}' + '"')
            } else {
                genout.writeLine('export LD_LIBRARY_PATH="' + outbin + sep + bitbin + sep + '${LD_LIBRARY_PATH}' + '"')
            }
            genout.writeLine('')
        } else {
            App.putenv('PATH', outbin + sep + bitbin + sep + App.getenv('PATH'))
            App.log.debug(2, "PATH=" + App.getenv('PATH'))
            if (Config.OS == 'MACOSX') {
                App.putenv('DYLD_LIBRARY_PATH', outbin + sep + bitbin + sep + App.getenv('DYLD_LIBRARY_PATH'))
            } else {
                App.putenv('LD_LIBRARY_PATH', outbin + sep + bitbin + sep + App.getenv('LD_LIBRARY_PATH'))
            }
        }
    }

    /*
        Run an event script.
        When values used are: prebuild, postblend, preresolve, presource, prebuild, action
     */
    function runScript(scripts, when) {
        if (scripts) {
            for each (item in scripts[when]) {
                let script = item.script.expand(bit, {fill: ''}).replace(/\\/g, '\\\\')
                let pwd = App.dir
                if (item.home && item.home != pwd) {
                    App.chdir(item.home)
                }
                try {
                    script = 'require ejs.unix\n' + script
                    eval(script)
                } finally {
                    App.chdir(pwd)
                }
            }
        }
    }

    /*
        Map libraries into the appropriate O/S dependant format
     */
    function mapLibs(libs: Array): Array {
        if (bit.platform.os == 'win') {
            libs = libs.clone()
            for (i in libs) {
                let llib = bit.dir.lib.join("lib" + libs[i]).joinExt(bit.ext.shlib)
                if (llib.exists) {
                    libs[i] = llib
                } else {
                    libs[i] = Path(libs[i]).replaceExt(bit.ext.shlib).relative
                }
            }
        } else if (bit.platform.os == 'vxworks') {
            libs = libs.clone()
            for (i = 0; i < libs.length; i++) {
                if (libs.contains(libs[i])) {
                    libs.remove(i)
                    i--
                }
            }
            for (i in libs) {
                let llib = bit.dir.lib.join("lib" + libs[i]).joinExt(bit.ext.shlib).relative
                if (llib.exists) {
                    libs[i] = llib
                } else {
                    libs[i] = '-l' + Path(libs[i]).trimExt().toString().replace(/^lib/, '')
                }
            }
        } else {
            libs = libs.map(function(e) '-l' + Path(e).trimExt().relative.toString().replace(/^lib/, ''))
        }
        return libs
    }

    /*
        Test if a target is stale vs the inputs AND dependencies
     */
    function stale(target) {
        if (target.built) {
            return false
        }
        if (generating) {
            return true
        }
        if (!target.path) {
            return true
        }
        let path = target.path
        if (!path.modified) {
            whyRebuild(target.name, 'Rebuild', target.path + ' is missing.')
            return true
        }
        for each (file in target.files) {
            if (file.modified > path.modified) {
                whyRebuild(path, 'Rebuild', 'input ' + file + ' has been modified.')
                return true
            }
        }
        for each (let dname: Path in target.depends) {
            let file
            if (!bit.targets[dname]) {
                let pack = bit.packs[dname]
                if (pack) {
                    if (!pack.enable) {
                        continue
                    }
                    file = pack.path
                    if (!file) {
                        whyRebuild(path, 'Rebuild', 'missing ' + file + ' for package ' + dname)
                        return true
                    }
                } else {
                    /* If dependency is not a target, then treat as a file */
                    if (!dname.modified) {
                        whyRebuild(path, 'Rebuild', 'missing dependency ' + dname)
                        return true
                    }
                    if (dname.modified > path.modified) {
                        whyRebuild(path, 'Rebuild', 'dependency ' + dname + ' has been modified.')
                        return true
                    }
                    return false
                }
            } else {
                file = bit.targets[dname].path
            }
            if (file.modified > path.modified) {
                whyRebuild(path, 'Rebuild', 'dependent ' + file + ' has been modified.')
                return true
            }
        }
        return false
    }

    /*
        Create an array of dependencies for a target
     */
    function makeDepends(target): Array {
        let includes: Array = []
        for each (path in target.files) {
            let str = path.readString()
            //  MOB - remove when array += null is a NOP
            let more = str.match(/^#include.*"$/gm)
            if (more) {
                includes += more
            }
        }
        let depends = [ bit.dir.inc.join('bit.h') ]
        for each (item in includes) {
            let ifile = item.replace(/#include.*"(.*)"/, '$1')
            let path
            for each (dir in target.includes) {
                path = Path(dir).join(ifile)
                if (path.exists && !path.isDir) {
                    break
                }
                path = null
            }
            if (path) {
                depends.push(path)
            } else {
                if (selectedTargets != 'clobber') {
                    App.log.error('Can\'t find include file "' + ifile + '" for ' + target.name)
                }
            }
        }
        return depends
    }

    /*
        Expand tokens in all fields in an object hash. This is used to expand tokens in bit file objects.
     */
    function expandTokens(o) {
        for (let [key,value] in o) {
            if (value is String) {
                o[key] = value.expand(bit, {fill: '${}'})
            } else if (value is Path) {
                o[key] = Path(value.toString().expand(bit, {fill: '${}'}))
            } else if (Object.getOwnPropertyCount(value) > 0) {
                o[key] = expandTokens(value)
            }
        }
        return o
    }

    /*
        Run a command and trace output
     */
    public function runCmd(command, cmdOptions = {}): Cmd {
        if (options.show) {
            if (command is Array) {
                trace('Run', command.join(' '))
            } else {
                trace('Run', command)
            }
        }
        let cmd = new Cmd
        if (bit.env) {
            let env = {}
            for (let [key,value] in bit.env) {
                if (value is Array) {
                    env[key] = value.join(App.SearchSeparator)
                } else {
                    env[key] = value
                }
            }
            cmd.env = env
        }
        App.log.debug(2, "Command " + command)
        cmd.start(command, cmdOptions)
        if (cmd.status != 0 && !cmdOptions.continueOnErrors) {
            if (!cmd.error || cmd.error == '') {
                throw 'Command failure: ' + cmd.response + '\nCommand: ' + command
            } else {
                throw 'Command failure: ' + cmd.error + '\nCommand: ' + command
            }
        }
        if (options.show || cmdOptions.show) {
            out.write(cmd.response)
            if (!cmdOptions.noshow) {
                out.write(cmd.error)
            }
        }
        return cmd
    }

    /*
        Make required output directories (carefully). Only make dirs inside the 'src' or 'top' directories.
     */
    function makeOutDirs() {
        for each (d in bit.dir) {
            if (d.startsWith(bit.dir.top) || d.startsWith(bit.dir.src)) {
                d.makeDir()
            }
        }
    }

    public function trace(tag: String, ...args): Void {
        if (!options.quiet) {
            let msg = args.join(" ")
            let msg = "%12s %s" % (["[" + tag + "]"] + [msg]) + "\n"
            out.write(msg)
        }
    }

    public function vtrace(tag, msg) {
        if (options.verbose) {
            trace(tag, msg)
        }
    }

    public function whyRebuild(path, tag, msg) {
        if (options.why) {
            trace(tag, path + ' because ' + msg)
        }
    }

    function whySkip(path, msg) {
        if (options.why) {
            trace('Target', path + ' ' + msg)
        }
    }

    function whyMissing(msg) {
        if (options.why) {
            trace('Init', msg)
        }
    }

    function diagnose(msg) {
        if (options.diagnose) {
            trace('Debug', msg)
        }
    }

    /*
        Run an action
     */
    public function action(cmd: String, actionOptions: Object = {}) {
        switch (cmd) {
        case 'cleanTargets':
            for each (target in bit.targets) {
                if (target.path && targetsToClean[target.type]) {
                    /* Pre-built targets must be preserved */
                    if (target.path.startsWith(bit.dir.cfg) && !target.built) {
                        if (generating == 'make') {
                            genout.writeLine('\trm -f ' + genReplace(target.path))
                        } else if (generating == 'sh') {
                            genout.writeLine('rm -f ' + genReplace(target.path))
                        } else if (target.path.exists) {
                            if (options.show) {
                                trace('Clean', target.path)
                            }
                            safeRemove(target.path)
                        }
                    }
                }
            }
            break
        }
    }

    function like(os) {
        if (posix.contains(os)) {
            return "posix"
        } else if (windows.contains(os)) {
            return "windows"
        }
        return ""
    }

    /*
        Map the architecture into an MPR architecture flag
        MOB - move to embedthis.es
     */
    function getMprArch(arch) {
        if (arch.match(/^i.86$|^x86$/)) {
            return 'MPR_CPU_IX86'
        } else if (arch.match(/^x86_64$|^amd64$/)) {
            return 'MPR_CPU_IX64'
        } else if (arch.match(/^power|^ppc/)) {
            return 'MPR_CPU_PPC'
        } else if (arch.match(/^sparc$/)) {
            return 'MPR_CPU_SPARC'
        } else if (arch.match(/^xscale$/)) {
            return 'MPR_CPU_XSCALE'
        } else if (arch.match(/^arm$|^strongarm$|^xscale$/)) {
            return 'MPR_CPU_ARM'
        } else if (arch.match(/^mips$/)) {
            return 'MPR_CPU_MIPS'
        } else if (arch.match(/^sh/)) {
            return 'MPR_CPU_SH4'
        }
        return 'MPR_CPU_UNKNOWN'
    }

    public static function load(o: Object) {
        b.loadInternal(o)
    }

    public static function loadFile(path: Path) {
        b.loadWrapper(path)
    }

    public function safeRemove(dir: Path) {
        if (bit.dir.top.same('/') || !dir.startsWith(bit.dir.top)) {
            throw 'Unsafe attempt to remove ' + dir + ' expected parent ' + bit.dir.top
        }
        dir.removeAll()
    }
}

} /* bit module */


/*
    Global functions for bit files
 */
require embedthis.bit

public var b: Bit = new Bit
b.main()

public function probe(file: Path, options = {}): Path {
    return b.probe(file, options)
}

public function program(name) {
    let packs = {}
    packs[name] = { path: probe(name, {fullpath: true})}
    Bit.load({packs: packs})
}

public function action(command: String, options = null)
    b.action(command, options)

public function trace(tag, msg)
    b.trace(tag, msg)

public function vtrace(tag, msg)
    b.vtrace(tag, msg)

public function install(src, dest: Path, options = {})
    b.install(src, dest, options)

public function package(formats)
    b.package(formats)

public function run(command, options = {show: true})
    b.runCmd(command, options)

public function safeRemove(dir: Path)
    b.safeRemove(dir)

function whyRebuild(path, tag, msg)
    b.whyRebuild(path, tag, msg)

/*
    @copy   default
  
    Copyright (c) Embedthis Software LLC, 2003-2012. All Rights Reserved.
    Copyright (c) Michael O'Brien, 1993-2012. All Rights Reserved.
  
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
  
    Local variables:
    tab-width: 4
    c-basic-offset: 4
    End:
    vim: sw=4 ts=4 expandtab

    @end
 */