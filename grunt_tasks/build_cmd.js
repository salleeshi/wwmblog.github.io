module.exports = function(grunt) {
  debugger;
  /* Building for Sea.js
     // Phase Trasform
     1. each TARGET defines a SCHEME of 
          how to transform file PATH to ID
          within a FOLDER
     2. each FILE within the FOLDER is a CMD
     3. for each CMD, change `define(FACTORY)` to `define(ID, DEPENDENCIES, FACTORY)`
     4. for each require/use call, change `require(xxx)` to `require(ID)`

     // Phase Concat
     1. specify an ALGORITHM to determine what files should be concat together
     2. output a seajs.config.alias object to indicate ID to PATH mapping.
   */

  /* Notes about SCHEME.
     the SCHEME is only applied if the DEPENDENCY is found within TARGET.
     otherwise, the PATH to ID is by a ALIAS FUNCTION.
   */

  /* Notes about CONCAT
     the dependencies must comes first.
   */

  var RE_HAS_DEFINE = /"(?:\\"|[^"])*"|'(?:\\'|[^'])*'|\/\*[\S\s]*?\*\/|\/(?:\\\/|[^/\r\n])+\/(?=[^\/])|\/\/.*|\.\s*define|(?:^|[^$])\b(def)(ine)\s*\(/g;
    /**/
  var RE_DEFINE_DEPS = /"(?:\\"|[^"])*"|'(?:\\'|[^'])*'|\/\*[\S\s]*?\*\/|\/(?:\\\/|[^/\r\n])+\/(?=[^\/])|\/\/.*|\.\s*define|(?:^|[^$])\bdefine\s*\(\s*(["']).+?\1\s*(["'])/g;
    /*'*/
  var RE_REQUIRE = /"(?:\\"|[^"])*"|'(?:\\'|[^'])*'|\/\*[\S\s]*?\*\/|\/(?:\\\/|[^/\r\n])+\/(?=[^\/])|\/\/.*|\.\s*require|(?:^|[^$])\brequire\s*\(\s*(["'])(.+?)\1\s*\)/g;
    /*"*/
  var RE_DEFINE = /"(?:\\"|[^"])*"|'(?:\\'|[^'])*'|\/\*[\S\s]*?\*\/|\/(?:\\\/|[^/\r\n])+\/(?=[^\/])|\/\/.*|\.\s*define|(?:^|[^$])\b(define)\s*\(\s*({|function)/g;


  var path  = require("path");
  var gFile = grunt.file;


  grunt.registerMultiTask("build_cmd", function () {
    grunt.log.ok( "Trasforming for target : " + this.target );

    var projectData = {
        content    : {}
      , dependency : {} // File's Dependency, abspath to ids
      , dep_expand : {} // like dependency, abspath to ids
      , dep_merge  : {} // abspath to abspath
      , requireMap : {}
      , scanArray  : []
      , notCMD     : {}
      , id2File    : {}
      , file2Id    : {}
    };
    var options     = this.options({
          path       : "."
        , scheme     : null
        , alias      : null 
        , recursive  : true
        , concatDeps : false
    });


    /// MultiTask Setup Code ///
    options.outputPath    = ensureTrailingSlash( options.outputPath );
    options.seajsBasePath = ensureTrailingSlash( options.seajsBasePath );

      // Make the TARGET's PATH relative to GruntFile
    if ( options.path == "." ) {
      options.path = options.seajsBasePath;
    } else {
      options.path = ensureTrailingSlash( options.seajsBasePath + options.path );
    }

    if ( !gFile.exists( options.outputPath ) ) { gFile.mkdir( options.outputPath ); }
    ///////////////////////////


    if ( !gFile.isPathInCwd( options.seajsBasePath) ) {
      grunt.fail.fatal("Seajs Base Path Not Found!");
    }


    /*
        Get project files list and add Dependecy-Scanning Tasks
     */
    gFile.recurse( options.path, function(abspath, rootdir, subdir, filename) {
      // Do nothing if it's not js file
      if ( filename.indexOf(".js") != filename.length - 3 || filename.length <= 3 ) { return; }
      // Do nothing if file is in subfolder and TARGET is not recursive.
      if ( options.recursive === false && subdir ) { return; }

      subdir = ensureTrailingSlash( subdir );
      var content = gFile.read(abspath).toString();

      projectData.scanArray.push(abspath);
      projectData.content[abspath] = content;

      scan( options, projectData, content, abspath );
    });

    console.log( "==== Deps ====" );
    console.log( projectData.dependency );

    console.log( "==== NotCMD ====" );
    console.log( projectData.notCMD );

    console.log( "==== Id2File ====" );
    console.log( projectData.id2File );

    console.log( "==== File2Id ====" );
    console.log( projectData.file2Id );


    /*
      Substitute Dependency with merge file.
     */
    this.files.forEach(function( file ){
      file.src.forEach(function( value ){
        projectData.dep_merge[ value ] = file.dest;
      });
    });
    console.log( "==== Dep_Merge ====" );
    console.log( projectData.dep_merge );

    /*
       Expand Dependency
     */
    // var dependency = projectData.dependency;
    // for ( var key in dependency ) {
    //   if ( !dependency.hasOwnProperty( key ) ) return;

    //   var deps      = dependency[key];
    //   var depMap    = {};
    //   var scanIndex = 0;
    //   while ( scanIndex < deps.length ) {

    //     for ( var len = deps.length; scanIndex < len; ++scanIndex ) {
    //       var depID = deps[scanIndex];
    //       if ( depMap[depID] ) { continue; }

    //       // This id has not been expanded.
    //       var abspath = projectData.id2File[ depID ];
    //       if ( !abspath ) { continue; }

    //       // Circular dependency
    //       if ( abspath == key ) {
    //         grunt.fail.warn("Circular dependency found in file : " + abspath);
    //         continue;
    //       } 

    //       var depdep = dependency[ abspath ];
    //       if ( depdep && depdep.length ) {
    //         deps = deps.concat( depdep );
    //       }
    //     }
    //   }

    //   projectData.dep_expand[key] = dereplicate( deps );
    // }

    // console.log( "==== Expand Deps ====" );
    // console.log( projectData.dep_expand );


    /*
       Substitute content
       Add ID.
       Add Dependency.
     */
    projectData.scanArray.forEach( function( abspath ){
      var c = transform( options, projectData, projectData.content[abspath], abspath);
      gFile.write( options.outputPath + abspath, c );
    });


    /*
        Concat CMD Files
        The dependency comes first.
     */
    this.files.forEach(function( file ) {
      var vertex = [].concat( file.src );
      var revert_dep_map = {};
      var visited = {};

      while ( vertex.length ) {
        var new_vertex = [];
        for ( var i = 0; i < vertex.length; ++i ) {
          var v = vertex[i];
          if ( visited.hasOwnProperty(v) ) { continue; }

          var deps = projectData.dependency[v];
          if ( deps ) {
            deps.forEach(function(value, index, array ){ 
              value = projectData.id2File[value];
              new_vertex.push( value );
              if ( !revert_dep_map[value] ) {
                revert_dep_map[value] = [];
              }
              
              revert_dep_map[value].push( v );
            });
          }
        }
        vertex = new_vertex;
      }

      if ( file.concatDeps !== true ) {
        var files = [].concat( file.src );
        while ( files.length ) {
          for ( i = 0; i < files.length; ++i ) {

          }
        }
        return;
      }

    });
    // this.files.forEach(function( file ){

    //   // Remap each src
    //   file.src.forEach(function( value, index, array ){

    //   });

    //   var content = file.src.filter(function(p) {
    //     if ( !grunt.file.exists( p ) ) {
    //       grunt.log.warn('Files not found when concating: ' + p);
    //       return false;
    //     }
    //     return true;
    //   }).map(function( p ) {
    //     // Read and return the file's source.
    //     return grunt.file.read(filepath);
    //   }).join('\n');

    // });
  });



  ////////////////////
  //// Helpers
  ////////////////////
  function dereplicate( array ) {
    var a = {};
    var b = [];
    for ( var i = 0, len = array.length; i < len; ++i ) {
      if ( a[ array[i] ] !== true ) {
        a[ array[i] ] = true;
        b.push( array[i] );
      }
    }
    return b;
  }
  function ensureTrailingSlash ( p ) {
    if ( !p || p.length == 0 ) { return ""; }
    p = path.normalize( p );
    switch ( p[p.length-1] ) {
      case "\\":
      case "/" :
        return p;
      default  :
        return p + "/";
    }
  }

  function colorLog ( text, color ) {
    var reset = "\033[0m"
    switch ( color ) {
      case "black"   : return '\033[30m' + text + reset;
      case "red"     : return '\033[31m' + text + reset;
      case "green"   : return '\033[32m' + text + reset;
      case "yellow"  : return '\033[33m' + text + reset;
      case "blue"    : return '\033[34m' + text + reset;
      case "magenta" : return '\033[35m' + text + reset;
      case "cyan"    : return '\033[36m' + text + reset;
      case "white"   : return '\033[37m' + text + reset;
      default        : return text;
    }
  }

  function resolveToBase ( abspath, base ) {
    // The input  `abspath` is relative to GruntFile
    // The output `path` is relative to base and normalized
    var abspaths = path.normalize( abspath ).split("/");
    var bases    = base.split("/");
    var newPaths = [];

    for ( var i = 0, j = 0; i < bases.length; ++i ) {
      if ( !bases[i] ) { break; }

      if ( bases[i] == abspaths[j] ) {
        ++j;
      } else {
        newPaths.push("..");
      }
    }

    if ( j > 0 ) { abspaths.splice(0, j); }
    abspaths = abspaths.join("/");

    return newPaths.length ? newPaths.join("/") + "/" + abspaths : abspaths;
  }

  function path2id( p, scheme ) {
    if ( scheme ) {
      return typeof scheme == "string" ?
                scheme.replace("{{filename}}", p) : scheme(p);
    } else {
      return p;
    }
  }

  var injectA = "var window={}, require=function(){};\n"
  + "var define = (function(){\n"
    + "var deps = null, d = function(i,d,f){\n"
      + "if ( deps == null ) { deps = []; }\n"
      + "if ( f ) { deps.push({ id:i, deps:d }) }\n"
      + "if ( d ) { deps.push({ id:i }) } }\n"
      + "d.__t_de1_ = function(n) { if(n===false) deps=null; return deps; }; \n"
      + "return d; })(); \n"
  + "try{\n\n";
  var injectB = "\n}catch(e){ define.__t_de1_(false); }\n;\ndefine.__t_de1_();";

  function scan( options, projectData, content, abspath ) {
    "use strict";

    var define_heads = [];

    var requireMap = projectData.requireMap[abspath] = {};

    // Test if the file is CMD module, and user-defined ID and Depenecies
    var hasDefine = false;
    content.replace( RE_HAS_DEFINE, function(m, m1, m2){ if(m2) { hasDefine = true; } return m; });
    // This `Regex Checking` is not perfect.
    // e.g. sea-debug.js is not a CMD, but it pass the checking.
    if ( !hasDefine ) {
      grunt.log.writeln(colorLog("   - ", "yellow") + "Ignoring none cmd : " + abspath );
      projectData.notCMD[abspath] = true;
      return;
    }

    // Use eval to quickly extract possible user defined id and deps.
    // If user defines ID and deps. Assume the user knows what
    // they're doing, thus the ID and deps is not modified.
    var predefines  = eval( injectA + content + injectB );
    var predefineID = null;
    if ( predefines == null ) {
      // This is 100% not a valid Sea.js module.
      grunt.log.writeln(colorLog("   - ", "yellow") + "Ignoring none cmd : " + abspath );
      projectData.notCMD[abspath] = true;
      return;
    } else if ( predefines.length ) {
      grunt.log.writeln(colorLog("   - ", "yellow") + "Found user-defined ID and Deps : " + abspath );

      // If the file already has predefines. Use them, instead of generating.
      var all_deps = [];
      var predefine_dep = false;
      predefines.forEach( function( val ){
        predefineID = val.id;
        projectData.id2File[ val.id  ] = abspath;
        projectData.file2Id[ abspath ] = val.id;

        if ( Array.isArray(val.deps) ) {
          predefine_dep = true;
          all_deps = all_deps.concat( val.deps );
        } else if ( val.deps ) {
          predefine_dep = true;
          all_deps.push( val.deps );
        }
      });

      if ( predefine_dep ) {
        projectData.dependency[abspath] = all_deps;
        return;
      }

      // User did not define dependency. We need to extract them.
    }

    // This is a well-formed Sea.js Module. i.e. No id and No deps.
    // Create dependency array
    var requires = [];
    content = content.replace( RE_REQUIRE, function( m, m1, m2, offset, string ){

      if ( m2 ) {
        // Found a require("XXX"), which XXX is m2;

        // The require uri can be :
        // relative : starts with . or ..
        //    It's relative to current module
        // normal   : starts with / or http://, https:// ...
        //    It's not relative to anything
        // absolute : everything else
        //    It's relative to seajsBasePath

        // The SCHEME is used to transform files within this TARGET
        // The ALIAS  is used to transform files within this PROJECT

        var replace = null;

        if ( /^\w{2,6}:\/\//.exec( m2 ) ) {
          // Do nothing if the uri is like http://, https://
          requires.push( m2 );
          return m;
        }

        if ( m2.length < 4 || m2.indexOf(".js") != m2.length - 3 ) { m2 += ".js"; }

        if ( m2[0] == "/" ) {
          // Use ALIAS to get ID for `normal` uri
          if ( options.alias ) {
            replace = options.alias( m2 );
          }
        } else {
          var absM2;
          var useScheme = true;

          if ( m2[0] == "." ) {
            absM2 = path.normalize( abspath + "/../" + m2 );
          } else {
            absM2 = path.normalize( options.path + m2 );
          }

          // Use SCHEME to get the ID of the file if only :
          // 1. The file exists and is inside TARGET's PATH
          // 2. The file is in subfolder and TARGET is `recursive`
          //    Or
          //    The file is not in subfolder

          if ( !gFile.exists( absM2 ) ) {
            useScheme = false;
          } else if ( absM2.indexOf( options.path ) != 0 ) {
            useScheme = false;
          } else if ( options.recursive === false ) {
            if ( absM2.replace( options.path ).indexOf("/") != -1 ) {
              useScheme = false;
            }
          }

          // Make m2 to be relative to seajsBasePath
          absM2 = resolveToBase( absM2, options.seajsBasePath );

          if ( useScheme ) {
            replace = path2id( absM2, options.scheme );
          } else {
            replace = options.alias ? options.alias( absM2 ) : null;
          }
        }

        // If we have a modified ID, use it, otherwise, use XXX from require(XXX).
        if ( replace ) { 
          requireMap[ m2 ] = replace;
          requires.push( replace );
        } else {
          requires.push( m2 );
        }
      }

      return m;
    });
    
    var thisFile = resolveToBase( abspath, options.seajsBasePath );
    var thisID   = predefineID ? predefineID : path2id( thisFile, options.scheme );

    projectData.id2File[ thisID  ]  = abspath;
    projectData.file2Id[ abspath ]  = thisID;
    projectData.dependency[abspath] = requires;
  }

  // Note : transform() does not support define("string") syntax.
  function transform(options, projectData, content, abspath) {

    if ( projectData.notCMD[abspath] ) {
      return content;
    }
    
    // Substitute require(XXX) to require(ID)
    var requireMap = projectData.requireMap[ abspath ];
    content = content.replace( RE_REQUIRE, function( m, m1, m2, offset, string ){

      if ( m2 && requireMap.hasOwnProperty( m2 ) ) {
        return 'require("' + requireMap[m2] + '")';
      } else {
        return m;
      }
    });

    // Change define(FACTORY) to define(ID,DEPENDENCIES,FACTORY)
    var newID      = projectData.file2Id[ abspath ];
    var new_define = "define('" 
                        + newID + "',"
                        + JSON.stringify( getMergedDependency(projectData, abspath, options.seajsBasePath) )
                        + ",";

    grunt.log.writeln( colorLog("   - ", 'blue') 
                        + "File : [" + abspath + "]" 
                        + colorLog(" >>>> ", 'blue') 
                        + "ID : \"" + newID + "\"" );
    
    content = content.replace( RE_DEFINE, function(m, m1, m2){ return m2 ? new_define + m2 : m; });

    // Write new content
    return content;
  }

  // The dependency array contains file path ( relative to seajs's base )
  function getMergedDependency( projectData, abspath, seajsBasePath ) {
    var calc_deps = [];
    var fileDeps = projectData.dependency[abspath];
    if ( !fileDeps ) { return calc_deps; }

    fileDeps.forEach(function( a_dep_id ){

      var dep_abs_path = projectData.id2File[ a_dep_id ];
      if ( projectData.dep_merge.hasOwnProperty(dep_abs_path) ) {
        dep_abs_path = projectData.dep_merge[ dep_abs_path ];
      }

      if ( dep_abs_path ) {
        dep_abs_path = resolveToBase( dep_abs_path, seajsBasePath );
      }

      calc_deps.push( dep_abs_path ? dep_abs_path : a_dep_id );
    });

    return dereplicate( calc_deps );
  }

  function SyncTasks () {
    this.tasks = [];
    this.index = -1;

    var endHandler = function(){};
    var self = this;

    this.next = function () {
      self.tasks[self.index]( self.done );
    }

    this.done = function() {
      ++self.index;
      if ( self.index >= self.tasks.length ) { 
        endHandler();
      } else {
        setTimeout( self.next, 0 );
      }

    }
    this.add    = function( task ) { this.tasks.push( task ); }
    this.addSub = function( task ) { this.tasks.splice( this.index, 0, task ); }
    this.start  = function( onFinished ) {
      if ( this.tasks.length < 1 ) {
        onFinished.apply( this );
      } else {
        this.index = 0;
        endHandler = onFinished;
        setTimeout( this.next, 0 );
      }
    }
  }

  
}
