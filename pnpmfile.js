module.exports = {
  hooks: {
    readPackage,
  },
};

const DEPS = ["dependencies", "devDependencies", "peerDependencies"];

class Replacement {}

class GlimmerX extends Replacement {
  static match(deps) {
    if (deps["@glimmerx/*"]) {
      let version = deps["@glimmerx/*"];
      delete deps["@glimmerx/*"];
      return new GlimmerX(version);
    }
  }

  packages = [
    "babel-plugin-component-templates",
    "component",
    "core",
    "eslint-plugin",
    "modifier",
    "service",
  ];

  constructor(version) {
    super();
    this.version = version;
  }

  update(deps) {
    for (let pkg of this.packages) {
      deps[`@glimmerx/${pkg}`] = this.version;
    }
  }
}

class Babel extends Replacement {
  static match(deps) {
    if (`@babel/*` in deps) {
      let version = deps["@babel/*"];

      if (version === "pnpmfile") {
        delete deps["@babel/*"];
        return new Babel();
      }
    }
  }

  packages = {
    core: "^7.9.0",
    "plugin-proposal-class-properties": "^7.8.3",
    "plugin-proposal-decorators": "^7.8.3",
    "plugin-syntax-class-properties": "^7.8.3",
    "plugin-transform-typescript": "^7.9.4",
    "preset-env": "^7.9.5",
    "preset-typescript": "^7.9.0",
  };

  update(deps) {
    for (let [name, version] of Object.entries(this.packages)) {
      deps[`@babel/${name}`] = version;
    }
  }
}

class Glimmer extends Replacement {
  static match(deps) {
    if (`@glimmer/*` in deps) {
      let version = deps["@glimmer/*"];

      if (version === "pnpmfile") {
        delete deps["@glimmer/*"];
        return new Glimmer();
      }
    }
  }

  packages = {
    "babel-plugin-glimmer-env": "^2.0.0-beta.7",
    "bundle-compiler": "^0.51.1",
    core: "^2.0.0-beta.7",
    validator: "^0.51.1",
    interfaces: "^0.51.1",
  };

  update(deps) {
    for (let [name, version] of Object.entries(this.packages)) {
      deps[`@glimmer/${name}`] = version;
    }
  }
}

function globalResolution(name, version) {
  return class Resolution {
    static match(deps) {
      if (name in deps) {
        let version = deps[name];

        // we're globally overriding every version, so don't do
        // a version check for 'pnpmfile' here

        delete deps[name];
        return new Resolution();
      }
    }

    version = version;

    update(deps) {
      deps[name] = this.version;
    }
  };
}

const TypeScriptResolution = globalResolution(
  "typescript",
  "4.0.0-dev.20200506"
);
const GlimmerResolution = globalResolution("@glimmer/validator", "^0.51.1");
const AcornResolution = globalResolution("acorn", "^7.0.0");

function readPackage(pkg, context) {
  for (let deps of DEPS) {
    replace(pkg[deps], GlimmerX);
    replace(pkg[deps], Glimmer);
    replace(pkg[deps], Babel);
    replace(pkg[deps], TypeScriptResolution);
    replace(pkg[deps], GlimmerResolution);
    replace(pkg[deps], AcornResolution);
  }

  return pkg;
}

function replace(deps, Updater) {
  let updater = Updater.match(deps);

  if (updater) {
    updater.update(deps);
  }
}
