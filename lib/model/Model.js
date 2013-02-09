var ModelError  = require('./ModelError').ModelError

/**
  @namespace model
**/
var model = {};

model.Model = function Model(name, schema, options) {
  var self = this

  name    = name    || this.name    || this.constructor.name;
  schema  = schema  || this.schema  || {};
  options = options || this.options || {};

  if (! name) throw new ModelError("A model needs a name.");

  this.name      = name;
  this.schema    = new mongoose.Schema(schema, options);
  this.options   = options;
  this.excluded  = [];
  this.fields    = {};
  this.model     = null;
  this.exposed   = [];
  this.embeded   = [];
  this.ns        = false;

  // Work around for toExpose method calls
  if (this.options._id === false) this.hide('_id');

  this.toExposed = function(exposed, excluded) {
    var clean = {}, json = this.toJSON()
      , key, value, i

    exposed = exposed || this.exposed;

    if (!exposed.length) return this.toJSON();
    else {
      for (i = 0; i < exposed.length; i++) {
        key = exposed[i];

        if (typeof self.options === 'object') {
          if (self.options[key] === false) continue;
        }

        value = pineapple.utils.valueFromPath(key, json);

        if (value) clean = pineapple.utils.setValueFromPath(key, value, json);
      }

      excluded = (typeof excluded === 'object' && excluded.length ?
                  self.excluded.concat(excluded) :
                  self.excluded);

      for (i = 0; i < excluded.length; i++) {
        if (excluded[i] in clean) {
          delete clean[excluded[i]];
        }
      }

      return clean;
    }
  };

  this.publicFields = [];

  this.method(function toJSON(overrides) {
    
  });

  /**
    Default static methods for a Model
  **/
  this.statics  = {
    foo : 'hi',
    getExposed : function(){
      self.exposed.toString = function(regex) { return this.join(regex || ' '); };
      return self.exposed;
    },

    first : function(callback) {
      return this.findOne(function(err, user){ if (typeof callback === 'function') callback.call(this, err, user); });
    },

    cleanse : function(model, embeded) {
      var index, prop, path, value

      for (prop in model) {
        if (typeof embeded === 'object' && embeded.length && !!~ (index = embeded.indexOf(prop))) {
          if (typeof model[prop] === 'object' && model[prop].length) {
            path = embeded[index];
            value = model[prop][0];

            pineapple.utils.setValueFromPath(path, value, model);
          }
        }
      }

      return model;
    }
  };
};

['add', 'pre', 'post', 'set', 'get', 'virtual'].map(function(method){
  model.Model.prototype[method] = function() {
    this.schema[method].apply(this.schema, arguments);
    return this;
  };
});

model.Model.prototype.define = function(overrides) {
  this.super(pineapple.utils.object.merge(this, overrides || {}));
  return this;
};

model.Model.prototype.field = function(definition) {
  if (typeof definition === 'object') {
    this.fields = typeof this.fields !== 'object'? {} : this.fields;
    this.fields = pineapple.utils.object.merge(pineapple.utils.object.merge({}, this.fields), definition);
  }
  
  for (field in this.fields) 
    if (this.fields[field] instanceof Object && this.fields[field].public)
      (!~this.publicFields.indexOf(field)) && this.public(field) && !function(field, fields){ delete fields[field].public; }(field, this.fields);
  
  return this;
};

model.Model.prototype.public = function() {
  this.publicFields = this.publicFields.concat.apply(this.publicFields, arguments);
  return this;
};

model.Model.prototype.method = function(func) {
  !func.name && (!function(){ throw new Error("Model#method needs a function vith a name."); }());
  this.schema.methods[func.name] = func;
  return this
};

model.Model.prototype.embeds = function(definition) {
  var Model, m

  for (var property in definition) {
    if (typeof definition[property] === 'function') {
      Model = pineapple.utils.inherit(model.Model, definition[property]);
      m = new Model(pineapple.models);
      definition[property] = m.create(false).schema.tree;
      delete definition[property].id;
      delete definition[property].exposed;
    }
  }

  return this.field(definition);
}

model.Model.prototype.get = function(fields) {
  for (var field in fields) this.schema.virtual(field, fields[field]);
  return this;
}

model.Model.prototype.embedsMany = function(definition) {
  var Model, m
  
  for (var property in definition) {
    if (typeof definition[property] === 'function') {
      Model = pineapple.utils.inherit(model.Model, definition[property]);
      m = new Model(pineapple.models);
      definition[property] = [m.create().schema];
    }
  }

  return this.field(definition);
}

model.Model.prototype.create = function(preventModel) {
  var func, Model, self = this, i, field, name

  name = this.ns && this.ns.length? this.ns + '.' + this.name : this.name;
  this.schema.add(this.fields);

  if (!preventModel) this.schema.virtual('exposed').get(function(){ return self.exposed; });

  for (func in this) 
    if (typeof this[func] === 'function' && !this.constructor.prototype[func] && !this.__proto__[func])
      this.schema.methods[func] = this[func];

  for (func in this.statics) 
    if (typeof this.statics[func] === 'function') this.schema.statics[func] = this.statics[func];

  if (!preventModel) this.model = Model = mongoose.model(name, this.schema);

  return Model;
};

model.Model.prototype.static = function(name, func) {
  var args = pineapple.utils.makeArray(arguments)
    , func

  if (typeof func === 'function') this.statics[name] = func;
  else if (typeof name === 'function') {
    while (func = args.shift())
      if (typeof func === 'function' && func.name.length) this.statics[func.name] = func;
  }
  else if (typeof name === 'object') {
    for (func in name)
      if (typeof name[func] === 'function') this.statics[func] = name[func];
  }
  else {
    throw new ModelError(name + " is not a function.");
  }

  return this;
};



model.Model.prototype.expose = function(properties) {
  this.exposed = this.exposed.concat(properties);

  return this;
};

model.Model.prototype.hide = function(hidee, recursive) {
  this.excluded           = this.excluded.concat(hidee);
  this.excludedRecursive  = true;

  return this;
};

model.Model.prototype.inherits = function() {
  var models = pineapple.utils.makeArray(arguments)
    , model
    , Model
    , name
    
  for (model in models) {
    model = models[model];

    if (typeof model === 'function') {
      model = new model(pineapple.models);
    }
    else if (typeof model === 'string') {
      model = pineapple.model.get(model, true);
      this.inherits(model);
    }
    
    if (typeof model === 'object') {
      this.schema       = pineapple.utils.object.merge(this.schema, model.schema);
      this.options      = pineapple.utils.object.merge(this.options, model.options);
      this.fields       = pineapple.utils.object.merge(model.fields || {});
      this.statics      = pineapple.utils.object.merge(this.statics, model.statics);
      this.excluded     = this.excluded.concat(model.excluded || []);
      this.exposed      = this.exposed.concat(model.exposed || []);
      this.embeded      = this.embeded.concat(model.embeded || []);
    }
  }

  return this;
}

model.Model.prototype.validateWith = function(property, rules, errorMessage) {
  var validator, i

  errorMessage  = errorMessage || "Invalid " + property;

  if (! property || !this.schema.paths[property]) {
    throw new ModelError(".validate() requires a valid property to validate.")
  }

  if (typeof rules === 'object') {
    for (i = 0; i < rules.length; i++) {
      validator = pineapple.model.validators.get(rules[i])

      if (! validator) {
        throw new ModelError("Invalid validator ["+ rules[i] + "]");
      }

      try {
        this.schema.path(property).validate(validator, errorMessage);
      }
      catch (err) {
        throw new ModelError(err.message);
      }
    }
  }
  else if (typeof rules === 'string'){
    validator = pineapple.model.validators.get(rules)

    try {
      this.schema.path(property).validate(validator, errorMessage);
    }
    catch (err) {
      throw new ModelError(err.message);
    }
  }
  else {
    throw new ModelError(".validate() requires a valid rule array of string.");
  }

  return this;
};

module.exports = model;