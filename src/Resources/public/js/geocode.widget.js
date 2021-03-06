/**
 * Geocode backend widget based on Leaflet.
 *
 * @package    netzmacht
 * @author     David Molineus <david.molineus@netzmacht.de>
 * @copyright  2016-2018 netzmacht David Molineus. All rights reserved.
 * @license    LGPL-3.0 https://github.com/netzmacht/contao-leaflet-geocode-widget/blob/master/LICENSE
 * @filesource
 */

var LeafletGeocodeAbstractPicker = L.Class.extend({
    initialize: function (map, options) {
        L.Util.setOptions(this, options);
        this.map = map;
    },
    show: function (position, radius) {
        if (!this.marker) {
            this._createMarker(position, radius);
        } else {
            this._updateCoordinates(position, radius);
        }

        this._panTo(position);
    },
    _updateCoordinates: function (position) {
        this.marker.setLatLng(position);
    }
});

var LeafletGeocodeMarkerPicker = LeafletGeocodeAbstractPicker.extend({
    apply: function (coordinatesInput) {
        var coordinates = this.marker
            ? ( this.marker.getLatLng().lat + ',' + this.marker.getLatLng().lng)
            : '';

        coordinatesInput.set('value', coordinates);
    },
    _panTo: function (position) {
        this.map.setZoom(this.map.getMaxZoom());
        this.map.panTo(position);
    },
    _createMarker: function (position) {
        this.marker = L.marker(position, {draggable: true}).addTo(this.map);
        this.marker.on('dragend', function () {
            this.map.panTo(this.marker.getLatLng());
        }.bind(this));
    }
});

var LeafletGeocodeCirclePicker = LeafletGeocodeAbstractPicker.extend({
    apply: function (coordinatesInput, radiusInput) {
        var radius      = '';
        var coordinates = this.marker
            ? ( this.marker.getLatLng().lat + ',' + this.marker.getLatLng().lng)
            : '';

        coordinatesInput.set('value', coordinates);

        if (this.marker) {
            radius = Math.round(this.marker.getRadius());

            if (this.options.radius.steps > 0) {
                radius = (this.options.radius.steps * Math.round(radius / this.options.radius.steps));
            }
        }

        radiusInput.set('value', radius);
    },
    _panTo: function () {
        this.map.fitBounds(this.marker.getBounds());
    },
    _createMarker: function (position, radius) {
        this.marker = L.circle(position, { radius: radius || this.options.radius.default });
        this.marker.addTo(this.map);

        this.marker.on('pm:markerdragend', function () {
            var radius = this.marker.getRadius();

            if (this.options.radius.steps > 0) {
                radius = (this.options.radius.steps * Math.round(radius / this.options.radius.steps));
            }

            if (this.options.radius.min > 0 && this.options.radius.min > radius) {
                radius = this.options.radius.min;
            }

            if (this.options.radius.max > 0 && this.options.radius.max < radius) {
                radius = this.options.radius.max;
            }

            if (radius != this.marker.getRadius()) {
                this.marker.pm.disable();
                this.marker.setRadius(radius);
                this._enableEditMode();
            } else {
                this.marker.pm._outerMarker.setTooltipContent(this._formatRadius(radius));
            }

            this.map.fitBounds(this.marker.getBounds());
        }.bind(this));

        this._enableEditMode();
    },
    _updateCoordinates: function (position,radius) {
        this.marker.pm.disable();
        this.marker.setLatLng(position);

        if (radius !== undefined) {
            this.marker.setRadius(radius);
        }
        this.marker.pm.enable();
    },
    _enableEditMode: function () {
        this.marker.pm.enable();
        this.marker.pm._outerMarker.bindTooltip(
            this._formatRadius(this.marker.getRadius()),
            {permanent: true, direction: 'right', offset: [10, 0] }
        );
    },
    _formatRadius: function (radius) {
        var unit = 'm';

        radius = Math.floor(radius);

        if (radius > 1000) {
            unit   = 'km';
            radius = (radius / 1000).toFixed(1);
        }

        return radius.toString() + ' ' + unit;
    }
});

var LeafletGeocodeWidget = L.Class.extend({
    options: {
        mapTemplate: '<div id="leaflet_geocode_widget_map_{id}" class="leaflet-geocode-map"></div>',
        modalWidth: 800,
        modalTitle: 'Choose coordinates',
        searchPositionLabel: 'Search',
        applyPositionLabel: 'Apply',
        confirmPositionLabel: 'Set as new position',
        okLabel: 'Ok',
        cancelLabel: 'Cancel',
        radius: null,
        picker: LeafletGeocodeMarkerPicker,
        map: {
            maxZoom: 15,
            minZoom: 2
        },
        bboxPadding: [0, 70]
    },
    initialize: function (options) {
        L.Util.setOptions(this, options);

        this.element = $(this.options.id);
        this.toggle  = $(this.options.id + '_toggle');
        this.toggle.addEvent('click', this._showMap.bind(this));

        if (this.options.radius) {
            this.radius = $(this.options.radius.element);

            if (this.radius.get('value').length > 0) {
                this.options.radius.default = parseInt(this.radius.get('value'));
            }

            if (this.options.radius.default === undefined) {
                this.options.radius.default = 0;
            }
        }
    },
    _showMap: function (e) {
        e.stop();

        // Create modal window.
        var content = L.Util.template(this.options.mapTemplate, this.options);
        this.modal  = this._createModal();

        this.modal.show({title: this.options.modalTitle, contents: content});

        // Initialize map after showing modal so element exists.
        this._createMap();
    },
    _createModal: function () {
        var modal = new SimpleModal({
            width: this.options.modalWidth,
            hideFooter: false,
            draggable: false,
            overlayOpacity: .5,
            btn_ok: Contao.lang.close,
            onShow: function () {
                document.body.setStyle('overflow', 'hidden');
            },
            onHide: function () {
                document.body.setStyle('overflow', 'auto');
            }
        });

        modal.addButton(Contao.lang.apply, 'btn', function () {
            this.picker.apply(this.element, this.radius);
            modal.hide();
        }.bind(this));

        return modal;
    },
    _createMap: function () {
        var map     = L.map('leaflet_geocode_widget_map_' + this.options.id, this.options.map).setView([0, 0], 2);
        var radius  = 0;
        this.picker = new this.options.picker(map, this.options);

        L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        map.on('click', function (event) {
            var marker       = new L.marker(event.latlng).addTo(map);
            var container    = document.createElement('div');
            var okButton     = document.createElement('button');
            var cancelButton = document.createElement('button');

            okButton.set('class', 'leaflet-geocode-btn').appendHTML(this.options.okLabel);
            okButton.addEvent('click', function (event) {
                event.stop();

                this.picker.show(marker.getLatLng());
                map.removeLayer(marker);
            }.bind(this));

            cancelButton.set('class', 'leaflet-geocode-btn').appendHTML(this.options.cancelLabel);
            cancelButton.addEvent('click', function (event) {
                map.removeLayer(marker);
            });

            container.appendHTML('<h2>' + this.options.confirmPositionLabel + '</h2>');
            container.appendChild(okButton);
            container.appendChild(cancelButton);

            marker.bindPopup(container, {
                keepInView: true,
                autoPanPaddingTopLeft: this.options.bboxPadding,
                autoClose: false,
                closeOnClick: false,
                closeButton: false
            }).openPopup();
        }.bind(this));

        var geoCoder = L.Control.geocoder({
            defaultMarkGeocode: false,
            collapsed: false,
            placeholder: this.options.searchPositionLabel
        }).addTo(map);

        geoCoder.on('markgeocode', function (event) {
            this.picker.show(event.geocode.center);
        }.bind(this));

        if (this.element.value) {
            if (this.radius && this.radius.get('value').length > 0) {
                radius = parseInt(this.radius.get('value'));
            }

            this.picker.show(L.latLng(this.element.value.split(/,/)), radius);
        }
    }
});
