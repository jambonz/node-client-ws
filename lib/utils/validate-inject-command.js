const assert = require('assert');
const injectSchema = require('../../data/inject-commands.json');

const validateEnumDataType = (command, schema, val) => {
  assert.ok(schema.enum.includes(val),
    `invalid value for command ${command}: got ${val} expected one of ${schema.enum.join(', ')}`);
};

const validateSimpleDataType = (command, schema, val) => {
  const allowedTypes = schema.split('|').map((s) => s.trim());
  if (allowedTypes.includes('string') && typeof val === 'string') return;
  if (allowedTypes.includes('number') && typeof val === 'number') return;
  if (allowedTypes.includes('array') && Array.isArray(val)) return;
  if (allowedTypes.includes('object') && typeof val === 'object') return;
  assert.fail(`invalid type for command ${command}: got ${typeof val} expected ${schema}`);
};

const validateObjectDataType = (command, schema, val) => {
  assert.ok(schema.properties, `invalid schema for command ${command}: missing properties`);
  assert.ok(schema.required, `invalid schema for command ${command}: missing required`);

  for (const [key, value] of Object.entries(val)) {
    const vSchema = schema.properties[key];
    assert.ok(schema.properties[key], `invalid property ${key} for command ${command}`);

    /* string with enumeration of allowed values */
    if (vSchema.enum) {
      validateEnumDataType(command, vSchema, value);
    }

    /* other simple data type */
    else if (typeof vSchema === 'string') {
      validateSimpleDataType(command, vSchema, value);
    }

    /* object data type */
    else if (typeof vSchema == 'object') {
      assert.ok(typeof value === 'object', `invalid value for property ${key} for command ${command}, expected object`);
      validateObjectDataType(command, vSchema, value);
    }

    /* nothing else is supported */
    else {
      assert.fail(`invalid schema for command ${command}`);
    }
  }

  /* validate required properties */
  // eslint-disable-next-line no-unused-vars
  for (const [_, property] of Object.entries(schema.required)) {
    assert.ok(val[property], `missing required property ${property} for command ${command}`);
  }
};

const validateInjectCommand = (command, opts) => {
  const schema = injectSchema[command];

  if (!schema) {
    assert.fail(`unsuppoorted command ${command}`);
  }

  /* string data type with enumerated values */
  if (schema.enum) {
    validateEnumDataType(command, schema, opts);
  }

  /* simple data type */
  else if (typeof schema === 'string') {
    validateSimpleDataType(command, schema, opts);
  }

  /* object data type */
  else if (typeof schema === 'object') {
    validateObjectDataType(command, schema, opts);
  }

  /* nothing else is supported */
  else {
    assert.fail(`invalid schema for command ${command}`);
  }
};


module.exports = {
  validateInjectCommand,
};
