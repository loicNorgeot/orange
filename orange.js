"use strict"

// register the application module
b4w.register("orange_main", function(exports, require) {

// import modules used by the app
var m_app       = require("app");
var m_cfg       = require("config");
var m_data      = require("data");
var m_preloader = require("preloader");
var m_ver       = require("version");

var m_mat       = require("material");
var m_container = require("container");
var m_mouse     = require("mouse");
var m_scenes    = b4w.require("scenes");
var m_objects   = b4w.require("objects");
var m_camera_anim = require("camera_anim");
var m_camera    = require("camera");
var m_vec3      = require("vec3");
var m_trans     = require("transform");

var m_time    = require("time");
var m_ctl     = require("controls");

//Camera animation parameters
var ANIM_TIME = 2;
var _anim_stop = false;
var _delta_target = ANIM_TIME;
var _cam_anim = {
    timeline: -ANIM_TIME,
    starting_eye: new Float32Array(3),
    starting_target: new Float32Array(3),
    final_eye: new Float32Array(3),
    final_target: new Float32Array(3),
    current_eye: new Float32Array(3),
    current_target: new Float32Array(3)
}
var _vec3_tmp = new Float32Array(3);

//Global variables
var ZOOM_LEVEL = 0;
var OBJECTS = new Object();
var ROOT_OBJECT = null;
var INIT_TARGET = new Float32Array(3);
var INIT_EYE    = new Float32Array(3);
var lastPos = [0,0];

// detect application mode
var DEBUG = (m_ver.type() == "DEBUG");

// automatically detect assets path
var APP_ASSETS_PATH = m_cfg.get_assets_path("orange");

exports.init = function() {
    m_app.init({
        canvas_container_id: "main_canvas_container",
        callback: init_cb,
        console_verbose: DEBUG,
        autoresize: true
    });
}
function init_cb(canvas_elem, success) {

  $("#clickMenu").hide();
  $("#help").hide();
  $("#left_list").hide();
  $("#metadata").hide();

  if (!success) {
      console.log("b4w init failure");
      return;
  }
  m_preloader.create_preloader();
  // ignore right-click on the canvas element
  canvas_elem.oncontextmenu = function(e) {
      e.preventDefault();
      e.stopPropagation();
      return false;
  };
  load();
}
function load() {
    m_data.load(APP_ASSETS_PATH + "orange.json", load_cb, preloader_cb);
}
function preloader_cb(percentage) {
    m_preloader.update_preloader(percentage);
}
function load_cb(data_id, success) {
    if (!success) {
        console.log("b4w load failure");
        return;
    }
    m_app.enable_camera_controls();


    m_scenes.set_outline_color([1,0.5,0]);

    //Custom functions and interactions
    create_menu();
    create_help();
    analyse_objects();

    //Set the camera animation
    var camobj = m_scenes.get_active_camera();
    init_camera_animation(camobj);
    m_camera.target_get_pivot(camobj, INIT_TARGET);
    m_trans.get_translation(camobj, INIT_EYE);
    var main_canvas = m_container.get_canvas();
    main_canvas.addEventListener("mouseup", main_canvas_up);
    main_canvas.addEventListener("mousedown", main_canvas_down);

}

function get_children(object_name){
  var found = false;
  var children = [];
  for ( var name in OBJECTS ){
    if ( name.indexOf(object_name) != 0 ){
      found = false;
    }
    if ( found ){
      children.push(OBJECTS[name]);
    }
    if ( name == object_name ){
      found = true;
    }
  }
  return children;
}


//CAMERA FUNCTIONS
function main_canvas_up(e) {

	if (e.button != 0)
    return;

	if (e.preventDefault)
    e.preventDefault();

  if( Math.sqrt( Math.pow(e.clientX - lastPos[0],2) + Math.pow(e.clientY - lastPos[1],2) > 100 )){
    return;
  }

	var obj = m_scenes.pick_object(e.clientX, e.clientY);

	//C'est ici que toute la logique de la selection se passe
	if (obj){

    ROOT_OBJECT = zoom(obj);
    var target = ROOT_OBJECT;

    if( obj.name.indexOf("Plane") ){
      console.log("Pas de type plan");

  	  //Choix de l'oeil et de la cible
  	  var splitted = ROOT_OBJECT.name.split(".");
  	  if (!isNaN(splitted[splitted.length-1]))
  	    splitted.pop()
  	  var eye = m_scenes.get_object_by_name(splitted.join(".")+".Empty");

      if (eye && target)
        move_cam(eye, target);
      else
        return;
    }
    //Si l'objet a plan dans son nom, alors on bouge au dessus
    else{
      console.log("de type plan");
      var camobj = m_scenes.get_active_camera();
      var pos_target = m_trans.get_translation(target);

      var pos_view = m_vec3.create();
      var diff = m_vec3.create();
      m_vec3.set(0,-1,2,diff);
      m_vec3.add(pos_target, diff, pos_view);
      start_camera_animation(camobj, pos_view, pos_target);
    }



	}
}
function move_cam(eye, target){
  var camobj = m_scenes.get_active_camera();
  var pos_view = m_trans.get_translation(eye);
  var pos_target = m_trans.get_translation(target);
  start_camera_animation(camobj, pos_view, pos_target);
}
function zoom( obj ){
  if( !obj ){
    reset_view();
    return null;
  }
	var obj_depth = get_depth(obj);
	if (obj_depth > ZOOM_LEVEL){
		name = obj.name.split(".").slice(0,ZOOM_LEVEL+1).join(".");
	  obj = m_scenes.get_object_by_name(name);
    ZOOM_LEVEL += 1;
	}
	ROOT_OBJECT = obj;
	hide_all_cb();
  m_scenes.show_object(obj);
	m_scenes.apply_outline_anim_def(obj);
  metadata(obj);
	var children = get_children(obj.name);
  for(var i = 0 ; i < children.length ; i++){
    m_scenes.show_object(children[i]);
    m_scenes.apply_outline_anim_def(children[i]);
  }
	return obj;
}
function get_depth(obj){
  var splitted = obj.name.split(".");
  if (!isNaN(splitted[splitted.length-1])){
    splitted.pop()
  }
  return splitted.length;
}
function reset_view(){
  ZOOM_LEVEL=0;
  var objs = m_scenes.get_all_objects("MESH");
  for(var i = 0 ; i < objs.length ; i++)
    m_scenes.show_object(objs[i]);
  $("#metadata").fadeOut(500);
  var camobj = m_scenes.get_active_camera();
  start_camera_animation(camobj, INIT_EYE, INIT_TARGET);
}
function main_canvas_down(e) {

    if (e.button != 0)
        return;

    var camobj = m_scenes.get_active_camera();

    if (m_ctl.get_sensor_value(camobj, "CAMERA_MOVE", 0) - _cam_anim.timeline
            < ANIM_TIME)
        _anim_stop = true;

    lastPos = [e.clientX, e.clientY];
}
function start_camera_animation(camobj, pos_view, pos_target) {
    // retrieve camera current position
    m_camera.target_get_pivot(camobj, _cam_anim.current_target);
    m_trans.get_translation(camobj, _cam_anim.current_eye);

    // set camera starting position
    m_vec3.copy(_cam_anim.current_target, _cam_anim.starting_target);
    m_vec3.copy(_cam_anim.current_eye, _cam_anim.starting_eye);

    // set camera final position
    m_vec3.copy(pos_view, _cam_anim.final_eye);
    m_vec3.copy(pos_target, _cam_anim.final_target);

    // start animation
    _delta_target = ANIM_TIME;
    _cam_anim.timeline = m_time.get_timeline();
}
function init_camera_animation(camobj) {

    var t_sensor = m_ctl.create_timeline_sensor();
    var e_sensor = m_ctl.create_elapsed_sensor();

    var logic_func = function(s) {
        // s[0] = m_time.get_timeline() (t_sensor value)
        return s[0] - _cam_anim.timeline < ANIM_TIME;
    }

    var cam_move_cb = function(camobj, id, pulse) {

        if (pulse == 1) {
            if (_anim_stop) {
                _cam_anim.timeline = -ANIM_TIME;
                return;
            }

            m_app.disable_camera_controls();

            // elapsed = frame time (e_sensor value)
            var elapsed = m_ctl.get_sensor_value(camobj, id, 1);
            var delta = elapsed / ANIM_TIME;

            m_vec3.subtract(_cam_anim.final_eye, _cam_anim.starting_eye, _vec3_tmp);
            m_vec3.scaleAndAdd(_cam_anim.current_eye, _vec3_tmp, delta, _cam_anim.current_eye);

            _delta_target -= elapsed;
            delta = 1 - _delta_target * _delta_target / (ANIM_TIME * ANIM_TIME);
            m_vec3.subtract(_cam_anim.final_target, _cam_anim.starting_target, _vec3_tmp);
            m_vec3.scaleAndAdd(_cam_anim.starting_target, _vec3_tmp, delta, _cam_anim.current_target);

            m_camera.target_set_trans_pivot(camobj, _cam_anim.current_eye, _cam_anim.current_target);

        } else {
            m_app.enable_camera_controls(false, false, false, null, true);
            if (!_anim_stop)
                m_camera.target_set_trans_pivot(camobj, _cam_anim.final_eye,
                        _cam_anim.final_target);
            else
                _anim_stop = false;
        }
    }

    m_ctl.create_sensor_manifold(camobj, "CAMERA_MOVE", m_ctl.CT_CONTINUOUS,
            [t_sensor, e_sensor], logic_func, cam_move_cb);
}

 //Create the right click menu
function create_menu(){
  var container = m_container.get_container();
  container.addEventListener("mouseup", display_menu_cb, false);
  $("#clickMenu").on("mouseleave",function(){
    $(this).hide();
  });
  add_global_menu_callback("menu_hide_all", hide_all_cb);
  add_global_menu_callback("menu_show_all", show_all_cb);
  add_global_menu_callback("menu_show_help", show_help_cb);
	add_global_menu_callback("menu_zoom_out", zoom_out_cb);
  add_global_menu_callback("menu_reset_view", reset_view);
}
function display_menu_cb(e){
  var x = m_mouse.get_coords_x(e);
  var y = m_mouse.get_coords_y(e);
  if(e.button==2){
    $("#clickMenu").css("top",y - 5);
    $("#clickMenu").css("left",x - 5);
    $("#clickMenu").show();
  }
}
//Create the menu interactions, linking an id with a function
function add_global_menu_callback(id, callback){
  $("#"+id).on("mouseup", function(){
    callback();
    $("#clickMenu").hide();
  });
}
function hide_all_cb(){
  var all_objs = m_scenes.get_all_objects("MESH");
  for (var i = 0 ; i < all_objs.length ; i++ ){
    m_scenes.hide_object(all_objs[i]);
  }
}
function show_all_cb(){
  var all_objs = m_scenes.get_all_objects("MESH");
  for (var i = 0 ; i < all_objs.length ; i++ ){
    m_scenes.show_object(all_objs[i]);
  }
	ZOOM_LEVEL = 0;
}
function show_help_cb(){
  $("#help").fadeIn(1000);
}
function zoom_out_cb(){
	if(ZOOM_LEVEL>0){
		var splitted = ROOT_OBJECT.name.split(".");
		splitted.pop();
		ZOOM_LEVEL -= 1;
    var parent=null;
    if (ZOOM_LEVEL!=0)
		  var parent = m_scenes.get_object_by_name(splitted.join("."));
    zoom(parent);

    if (parent){
      var eye = m_scenes.get_object_by_name(parent.name+".Empty");
  	  var target = ROOT_OBJECT;
      //Move the camera
      if (eye && target)
        move_cam(eye, target);
      else
        return;
    }
    else
      reset_view();

    if( ! m_objects.get_meta_tags(parent) )
      $("#metadata").fadeOut();
  }

}

function create_help(){
  $("#help #close").on("click", function(){
    $("#help").fadeOut(1000);
  });
}

function metadata(obj){
  var meta = m_objects.get_meta_tags(obj);
  if(meta){
    $("#metatitle").html(meta.title ? meta.title : "Titre");
    $("#metadesc").html(meta.description ? meta.description : "Ceci est une description");
    $("#metacat").html(meta.category ? meta.category : "Catégorie");
    $("#metadata").fadeIn(500);
  }
  else{
    $("#metadata").fadeOut(500);
  }
}
//Create the objects architecture

function analyse_objects(){
  //Prepare by alphabetical order
  var _objs = m_scenes.get_all_objects("MESH");
  _objs.sort(function(a,b){
    if (a.name < b.name) return -1;
    else return 1;
  });

  //Iterate over objects
  for(var i = 0 ; i < _objs.length ; i++)
    OBJECTS[_objs[i].name] = _objs[i];
}

});

// import the app module and start the app by calling the init method
b4w.require("orange_main").init();
