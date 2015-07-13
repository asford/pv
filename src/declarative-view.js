/* jshint maxlen: 130 */

define([
  './extern/underscore',
  './color'],
  function(
    _,
    color
  )
{

  var colorOptions = {
    "by_chain" : color.byChain,
    "by_element" : color.byElement,
    "by_ss" : color.bySS,
    "rainbow" : color.rainbow,
    "chainbow" : color.ssSuccession
  };

  function renderView(viewer, name, structure, view_spec) {
    // Validate 'mode' option
    if( !_.has(view_spec, "mode")) {
      throw new Error("View spec missing 'mode'.");
    } 
    else if( _.indexOf(viewer.RENDER_MODES, view_spec.mode) < 0) {
      console.log(viewer.RENDER_MODES, view_spec.mode);
      throw new Error("View spec has invalid 'mode': " + view_spec.mode);
    }

    var options = {};

    // Resolve optional color options
    if (_.has(view_spec, "color")) {
      if (_.has(colorOptions, view_spec.color)) {
        options.color = colorOptions[view_spec.color]();
      }
      else if( _.isString(view_spec.color)) {
        options.color = color.uniform(view_spec.color);
      }
      else {
        throw new Error("Invalid view property 'color': "  + view_spec.color);
      }
    }

    return viewer.renderAs( name, structure, view_spec.mode, options);
  }

  return {
    renderView : renderView,
    colorOptions : colorOptions
  };

});
