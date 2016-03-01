webreduce = window.webreduce || {};
webreduce.instruments = webreduce.instruments || {};

(function webreduction() {
     //"use strict";
     // add a comment

    active_reduction = {
      "config": {},
      "template": {}
    }
    current_instrument = "ncnr.refl";

    var NEXUS_ZIP_REGEXP = /\.nxz\.[^\.\/]+$/
    var dirHelper = "listftpfiles.php";
    var data_path = ["ncnrdata"];
    var statusline_log = function(message) {
      var statusline = $("#statusline");
      if (statusline && statusline.html) {
        statusline.html(message);
      }
    }

    webreduce.statusline_log = statusline_log;

    function getUrlVars() {
      var vars = [], hash;
      var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
      for(var i = 0; i < hashes.length; i++) {
        hash = hashes[i].split('=');
        vars.push(hash[0]);
        vars[hash[0]] = hash[1];
      }
      return vars;
    }

    webreduce.hooks = {};
    webreduce.hooks.resize_center = null;

    window.onpopstate = function(e) {
      // called by load on Safari with null state, so be sure to skip it.
      //if (e.state) {
      var start_path = $.extend(true, [], data_path),
        url_vars = getUrlVars();
      if (url_vars.pathlist && url_vars.pathlist.length) {
        start_path = url_vars.pathlist.split("+");
      }
      webreduce.server_api.get_file_metadata(start_path).then(webreduce.updateFileBrowserPane("remote_source_1", start_path, current_instrument));
    }

    window.onpopstate();

    window.onload = function() {
      var layout = $('body').layout({
           west__size:          350
        ,  east__size:          300
        ,  south__size:         200
          // RESIZE Accordion widget when panes resize
        ,  west__onresize:	    $.layout.callbacks.resizePaneAccordions
        ,  east__onresize:	    $.layout.callbacks.resizePaneAccordions
        ,  south__onresize:     $.layout.callbacks.resizePaneAccordions
        ,  center__onresize:    webreduce.hooks.resize_center
      });

		  layout.toggle('east');
      //$.post(dirHelper, {'pathlist': $("#remote_path").val().split("/")}, function(r) { categorize_files(r.files)});

      // need to make field-datatype-specific client actions... for example, the super_load
      // module has fields with datatypes 'fileinfo', 'bool', 'bool', ...
      // for the fileinfo field, want to interact with the file chooser on the left panel
      // for the boolean inputs, want checkboxes.


      // require(d3, dataflow)
      webreduce.editor = {};
      webreduce.editor.create_instance = function(target_id) {
        // create an instance of the dataflow editor in
        // the html element referenced by target_id
        this._instance = new dataflow.editor();
        this._target_id = target_id;
      }
      webreduce.editor.handle_module_clicked = function() {
        // module group is 2 levels above module title in DOM
        webreduce.editor.dispatch.on("accept", null);
        var target = d3.select("#" + this._target_id);
        var index = d3.select(target.select(".module .selected").node().parentNode.parentNode).attr("index");
        var active_module = this._active_template.modules[index];
        var module_def = this._module_defs[active_module.module];
        var fields = module_def.fields || [];
        fields_dict = {};
        fields.forEach(function(f) {
          fields_dict[f.id] = f.default}
        );
        jQuery.extend(true, fields_dict, active_module.config);
        layout.open("east");
        var target = d3.select(".ui-layout-pane-east");
        target.selectAll("div").remove();
        webreduce.editor.make_form(fields, active_module);
        webreduce.editor.handle_fileinfo(fields, active_module);

        target.append("div")
          .style("position", "absolute")
          .style("bottom", "0")
          .append("button")
            .text("accept")
            .on("click", function() {
              console.log(target, active_module);
              webreduce.editor.accept_parameters(target, active_module);
              webreduce.editor.handle_module_clicked();
            })
      }
      webreduce.editor.handle_terminal_clicked = function() {
        var target = d3.select("#" + this._target_id);
        var selected = target.select(".module .selected");
        var index = d3.select(selected.node().parentNode.parentNode).attr("index");
        var terminal_id = selected.attr("terminal_id");
        console.log(index, terminal_id);
      }

      webreduce.editor.accept_parameters = function(target, active_module) {
        target.selectAll("div.fields")
          .each(function(d) {
            console.log(d)
            d.forEach(function(data) {
              active_module.config[data.id] = data.value;
            });
          });
      }
      
      webreduce.editor.handle_fileinfo = function(fields, active_module) {
        var fileinfos = fields.filter(function(f) {return f.datatype == 'fileinfo'});
        var target = d3.select(".ui-layout-pane-east");
        target.append("div")
          .attr("id", "fileinfo")
          //.classed("fields", true);
          
        fileinfos.forEach(function(fi) {
          var datum = {"id": fi.id, value: []},
              existing_count = 0;
          if (active_module.config && active_module.config[fi.id] ) {
            existing_count = active_module.config[fi.id].length;
            datum.value = active_module.config[fi.id];
          }
          var radio = target.select("#fileinfo").append("div")
            .classed("fields", true)
            .datum([datum])
          radio.append("input")
            .attr("id", fi.id)
            .attr("type", "radio")
            .attr("name", "fileinfo");
          radio.append("label")
            .attr("for", fi.id)
            .text(fi.id + "(" + existing_count + ")");
            
          $(radio.node()).on("fileinfo.update", function(ev, info) {
            if (radio.select("input").property("checked")) {
                radio.datum([{id: fi.id, value: info}]);
            } 
          });

        });
        $("#fileinfo input").first().prop("checked", true);
        $("#fileinfo input").on("click", function() {
          //console.log(d3.select(this).datum());
          $(".remote_filebrowser").trigger("fileinfo.update", d3.select(this).datum());
        })
        $("#fileinfo").buttonset();
        webreduce.handleChecked(); // to populate the datum
      }
      
      webreduce.editor.fileinfo_update = function(fileinfo) {
        $(".remote_filebrowser").trigger("fileinfo.update", [fileinfo]);
      }

      webreduce.editor.make_form = function(fields, active_module) {
        var data = [];
        var conversions = {
          'bool': 'checkbox',
          'float': 'number',
          'str': 'text'
        }
        for (var i=0; i<fields.length; i++) {
          var field = fields[i];
          var dt = field.datatype.split(":"),
              datatype = dt[0],
              units = dt[1];
          if (units === "") {units = "unitless"}
          if (datatype in conversions) {
            var value = (active_module.config && active_module.config[field.id])? active_module.config[field.id] : field.default;
            data.push({
              'type': conversions[field.datatype],
              'value': value,
              'label': field.label + ((units === undefined) ? "" : "(" + units + ")"),
              'id': field.id
            });
          }
        }

        var target = d3.select(".ui-layout-pane-east");
        target.selectAll("div").remove();
        //var forms = target.select("div.form")
        //.data([data]).enter()
        var forms = target.append("div")
          .classed("form fields", true)
          .style("list-style", "none");
        forms.datum(data);
        
        forms.selectAll("li")
          .data(function(d) {return d})
          .enter()
          .append("li")
          .append("label")
          .text(function(d) {return d.label})
          .append("input")
          .attr("type", function(d) {return d.type})
          .attr("field_id", function(d) {return d.id})
          .attr("value", function(d) {return d.value})
          .property("checked", function(d) {return d.value})
          .on("change", function(d) {
            var item = d3.select(this);
            if (this.type == "checkbox") { d.value = this.checked }
            else { d.value = this.value }
          });
        
        //$(forms.node()).on("accept", function() {
        /*webreduce.editor.dispatch.on("accept.form", function() {
          active_module.config = active_module.config || {};
          forms.selectAll("li")
          .each(function() {
            var item = d3.select(this).select("input");
            var value = (item.attr("type") == "checkbox") ? item.property("checked") : item.attr("value");
            var field_id = item.attr("field_id");
            active_module.config[field_id] = value;
          })
        });
        */
          //  alert("accepting fields");
          //  active_module.config = active_module.config || {};
          //  active_module.config[d3.select(this).attr('field_id')] = this.value;
          //})
      }

      webreduce.editor.load_instrument = function(instrument_id) {
        var editor = this;
        editor._instrument_id = instrument_id;
        return webreduce.server_api.get_instrument(instrument_id)
          .then(function(instrument_def) {
            editor._instrument_def = instrument_def;
            editor._module_defs = {};
            if ('modules' in instrument_def) {
              for (var i=0; i<instrument_def.modules.length; i++) {
                var m = instrument_def.modules[i];
                editor._module_defs[m.id] = m;
              }
            }
            // load into the editor instance
            editor._instance.module_defs(editor._module_defs);
            // pass it through:
            return instrument_def;
          })
      }
      webreduce.editor.load_template = function(template_def) {
        this._instance.data([template_def]);
        this._active_template = template_def;
        var target = d3.select("#" + this._target_id);

        target.call(this._instance);

        target.selectAll(".module").classed("draggable wireable", false);

        target.selectAll(".module .terminal").on("click", function() {
          target.selectAll(".module .selected").classed("selected", false);
          d3.select(this).classed('selected', true);
          webreduce.editor.handle_terminal_clicked();
        });
        target.selectAll(".module g.title").on("click", function() {
          target.selectAll(".module .selected").classed("selected", false);
          d3.select(this).select("rect.title").classed("selected", true);
          webreduce.editor.handle_module_clicked();
        });
      }

      webreduce.editor.dispatch = d3.dispatch("accept");
      webreduce.editor.create_instance("bottom_panel");
      webreduce.editor.load_instrument(current_instrument)
        .then(function(instrument_def) { webreduce.editor.load_template(instrument_def.templates[0]); });
  }

})();
