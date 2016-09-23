define([
    'providers/default',
    'providers/providers-supported',
    'providers/providers-loaded',
    'utils/underscore'
    ], function(Default, ProvidersSupported, ProvidersLoaded, _) {

    function Providers(config) {
        this.config = config || {};
        this.providers = this.reorderProviders(this.config.primary);
    }

    Providers.loaders = {
        html5: function(resolve, reject) {
            var timeout = setTimeout(reject, 8000);
            require.ensure(['providers/html5'], function(require) {
                clearTimeout(timeout);
                var provider = require('providers/html5');
                registerProvider(provider);
                resolve(provider);
            }, 'provider.html5');
        },
        flash: function(resolve, reject) {
            var timeout = setTimeout(reject, 8000);
            require.ensure(['providers/flash'], function(require) {
                clearTimeout(timeout);
                var provider = require('providers/flash');
                registerProvider(provider);
                resolve(provider);
            }, 'provider.flash');
        },
        youtube: function(resolve, reject) {
            var timeout = setTimeout(reject, 8000);
            require.ensure(['providers/youtube'], function(require) {
                clearTimeout(timeout);
                var provider = require('providers/youtube');
                registerProvider(provider);
                resolve(provider);
            }, 'provider.youtube');
        }
    };

    var registerProvider =
    Providers.registerProvider = function(provider) {
        var name = provider.getName().name;

        // Only register the provider if it isn't registered already.  This is an issue on pages with multiple embeds.
        if (ProvidersLoaded[name]) {
            return;
        }

        // If there isn't a "supports" val for this guy
        if (! _.find(ProvidersSupported, _.matches({name : name}))) {
            if (!_.isFunction(provider.supports)) {
                throw {
                    message: 'Tried to register a provider with an invalid object'
                };
            }

            // The most recent provider will be in the front of the array, and chosen first
            ProvidersSupported.unshift({
                name : name,
                supports : provider.supports
            });
        }

        var F = function(){};
        F.prototype = Default;
        provider.prototype = new F();

        // After registration, it is loaded
        ProvidersLoaded[name] = provider;
    };

    _.extend(Providers.prototype, {

        load: function(providersToLoad) {
            return Promise.all(_.map(providersToLoad, function(provider) {
                return new Promise(function(resolve, reject) {
                    var providerLoaderMethod = Providers.loaders[provider.name];
                    if (providerLoaderMethod) {
                        var rejectProviderLoaded = function() {
                            reject({
                                message: 'Could not load "' + provider.name + '" provider'
                            });
                        };
                        providerLoaderMethod(resolve, rejectProviderLoaded);
                    } else {
                        resolve(/* unknown registered module */);
                    }
                });
            }));
        },

        reorderProviders: function (primary) {
            var providers = _.clone(ProvidersSupported);

            if (primary === 'flash') {
                var flashIdx = _.indexOf(providers, _.findWhere(providers, {name: 'flash'}));
                var flashProvider = providers.splice(flashIdx, 1)[0];
                var html5Idx = _.indexOf(providers, _.findWhere(providers, {name: 'html5'}));
                providers.splice(html5Idx, 0, flashProvider);
            }
            return providers;
        },

        providerSupports: function(provider, source) {
            return provider.supports(source);
        },

        required: function(playlist, primary) {
            var _this = this;
            var providers = this.reorderProviders(primary);

            playlist = playlist.slice();
            return _.compact(_.map(providers, function(provider) {
                // remove items from copied playlist that can be played by provider
                // remaining providers will be checked against any remaining items
                // provider will be loaded if there are matches
                var loadProvider = false;
                for (var i = playlist.length; i--;) {
                    var item = playlist[i];
                    var supported = _this.providerSupports(provider, item.sources[0]);
                    if (supported) {
                        playlist.splice(i, 1);
                    }
                    loadProvider = loadProvider || supported;
                }
                if (loadProvider) {
                    return provider;
                }
            }));
        },

        // Find the name of the first provider which can support the media source-type
        choose : function(source) {
            // prevent throw on missing source
            source = _.isObject(source) ? source : {};

            var count = this.providers.length;
            for (var i = 0; i < count; i++) {
                var provider = this.providers[i];
                if (this.providerSupports(provider, source)) {
                    // prefer earlier providers
                    var priority = count - i - 1;

                    return {
                        priority: priority,
                        name : provider.name,
                        type: source.type,
                        providerToCheck: provider,
                        // If provider isn't loaded, this will be undefined
                        provider : ProvidersLoaded[provider.name]
                    };
                }
            }

            return null;
        }
    });

    return Providers;
});