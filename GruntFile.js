module.exports = function(grunt) {

  // HOW TO BUILD
  // 1. Specify every build options in this GruntFile.js
  // 2. Load necessary tasks to finish the building.

  grunt.initConfig({
      "seajs_build" : {
        options : { 
          outputPath    : "build"
        , seajsBasePath : "js" // a path that points to the same location as `Sea.js's base`
                               // relative to GruntFile.js

        // Following options' value is their default value
        , path       : "."
                // a folder that is relative to `seajsBasePath`, files within the folder will be added ID.
        , scheme     : null
                // `scheme` type:
                //   String, {{filename}} is replace by the file path, relative to `seajsBasePath`.
                //   Function : function( FILENAME ) { return ID; }
                //   Falsy, the ID is FILENAME.
        , alias      : null
                // Use `alias` to map PATH (relative to `seajsBasePath`) to ID, if :
                // 1. The dependency is not found within the TARGET's path.
                // 2. The dependency's path is not relative path.
                // Otherwise, use `scheme` to determine the ID
        , recursive  : true
                // If true, add ID for files in subfolder.
        , buildType  : "exclude_merge"
                // Possible values :
                // "all"
                //   Build and output all files in TARGET, then output the merged file.
                // "merge_only"
                //   Only merged file ( specified in `TARGET's files` ) will be created in `outputPath`
                // "exclude_merge"
                //   Output the merged file. Then output those not merged files.
      }

      // Target `main`
      // A build_cmd TARGET does :
      // 1. use `scheme` and `alias` to add ID for each CMD module file within `path`
      // 2. concat CMD into one file.
      , main : { 
          options : { path : "." }

        // `files` is used to determine what files should be merge to one file.
        // See https://github.com/gruntjs/grunt/wiki/Configuring-tasks#files
        // Parameters : 
        //   `src`  is relative to GruntFile
        //   `dest` is relative to options.outputPath
        //   `concatDeps` ( default:false ): If true, include all dependencies into one file, recursively.
        , files : [
            { 
              src        : "js/main.js"
            , dest       : "js/main.js"
            , filter     : "isFile"
            , concatDeps : true
          }
        ]
      }
    }
    , uglify : { 
          options : { 
              mangle : false
            , compress : false
          }
        , minify  : {
          expand  : true
        , cwd     : "build/js"
        , src     : ['*.js', '**/*.js'] 
        , dest    : 'build/js'
        , ext     : '.js'
      }
    }
    , cssmin : { 
        options : { report : "min" }
      , minify  : {
          expand : true
        , cwd    : "css/"
        , src    : ['*.css']
        , dest   : 'css/'
        , ext    : '.css'
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-cssmin');
  grunt.loadTasks('grunt-seajs-build/tasks');

  grunt.registerTask("default", ['seajs_build', 'uglify', 'cssmin']);
}