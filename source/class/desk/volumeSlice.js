/*
#ignore(THREE.*)
#ignore(THREE)
#ignore(Uint8Array)
*/

qx.Class.define("desk.volumeSlice", 
{
  extend : qx.core.Object,

	construct : function(file, fileBrowser, orientation, parameters)
	{
		this.base(arguments);

		this.setOrientation(orientation);

		if (parameters!=null) {
			if (parameters.imageFormat!=null) {
				this.setImageFormat(parameters.imageFormat);
			}

			if (parameters.colors!=null) {
				this.setLookupTables(parameters.colors);
			}
		}
		

		this.__image=new Image();
		var texture=new THREE.Texture(this.__image);
		this.__texture = texture;
		texture.generateMipmaps=false;
		texture.magFilter=THREE.NearestFilter;
		texture.minFilter=THREE.NearestFilter;

		var data=new Uint8Array( 2*4);
		data[0]=255;
		data[1]=0;
		data[2]=0;
		data[3]=255;
		data[4]=0;
		data[5]=0;
		data[6]=255;
		data[7]=255;

		var lookupTable = new THREE.DataTexture( data , 2, 1, THREE.RGBAFormat );
		lookupTable.generateMipmaps=false;
		lookupTable.magFilter=THREE.NearestFilter;
		lookupTable.minFilter=THREE.NearestFilter;
		lookupTable.needsUpdate=true;

		this.__material=new THREE.ShaderMaterial({
			uniforms: {
				texture: { type: "t", value: 0, texture: texture },
				lookupTable: { type: "t", value: 1, texture: lookupTable },
				lookupTableLength : { type: "i", value: 2 },
				useLookupTable : { type: "f", value: 0 },
				contrast : { type: "f", value: 1.0 },
				brightness : { type: "f", value: 0.0 },
				opacity : { type: "f", value: 1.0 }
			},
			vertexShader: desk.volumeSlice.VERTEXSHADER,
			fragmentShader: desk.volumeSlice.FRAGMENTSHADER,
			transparent : true
		});

		this.__fileBrowser=fileBrowser;
		this.__file=file;
		this.update();

		this.__initChangeSliceTrigger();

		this.addListener("changeImageFormat", function(){
				this.update();
			},this);

		return (this);		
	},

	properties : {
		slice : { init : -1, check: "Number", event : "changeSlice"},
		imageFormat : { init : 1, check: "Number", event : "changeImageFormat"},
		ready : { init : false, check: "Boolean", event : "changeReady"},
		orientation : { init : 0, check: "Number", event : "changeOrientation"}
	},

	events : {
		// the "changeSlice" event is fired whenever the image changes
		"changeImage" : "qx.event.type.Event"
	},

	statics : {
		VERTEXSHADER : [
			"varying vec2 vUv;",
			"varying vec3 vPosition;",
			"void main( void ) {",
			"vUv = uv;",
			"vPosition = position;",
			"gl_Position = projectionMatrix * modelViewMatrix * vec4(vPosition, 1);",
			"}"
		].join("\n"),

		FRAGMENTSHADER : [
			"uniform sampler2D texture;",
			"uniform sampler2D lookupTable;",
			"uniform int lookupTableLength;",
			"uniform float useLookupTable;",
			"uniform float contrast;",
			"uniform float brightness;",
			"uniform float opacity;",

			"varying vec2 vUv;",
			"varying vec3 vPosition;",
			"void main() {",
				
				"vec4 rgba = texture2D( texture, vUv );",
				"highp float Sign = 1.0 - step(128.0,rgba[0])*2.0;",
				"highp float Exponent = 2.0 * mod(rgba[0],128.0) + step(128.0,rgba[1]) - 127.0;",
				"highp float Mantissa = mod(rgba[1],128.0)*65536.0 + rgba[2]*256.0 +rgba[3];",// + (0x800000);",
//				"highp float Mantissa = mod(rgba[1],128.0)*65536.0 + rgba[2]*256.0 +rgba[3] + float(0x800000);",
				"highp float Result = Sign * Mantissa * pow(2.0,Exponent - 23.0);",

				"vec4 textureColor = texture2D( texture, vUv );",
				"float pixelValue=textureColor[0];",
				"float correctedPixelValue=(pixelValue-0.5+brightness)*contrast+0.5;",
				"vec4 correctedColor=vec4(correctedPixelValue);",
				"correctedColor[3]=opacity;",

				"float clampedValue=clamp(correctedPixelValue, 0.0, 1.0);",
				"vec2 colorIndex=vec2(clampedValue,0.0);",
				"vec4 colorFromLookupTable = texture2D( lookupTable,colorIndex  );",
				"colorFromLookupTable[3]=opacity;",
				"gl_FragColor=mix (correctedColor, colorFromLookupTable, useLookupTable);",
//				"gl_FragColor=colorFromLookupTable;",
			"}"
		].join("\n")
	},

	members : {

		__availableImageFormat : null,

		__fileBrowser : null,
		__file : null,

		__path : null,
		__offset : null,
		__prefix : null,
		__image : null,

		__timestamp : null,
		__fileFormatBox : null,

		__extent : null,
		__origin : null,
		__spacing : null,
		__dimensions: null,

		__scalarTypeString : null,
		__scalarType : null,
		__scalarSize : null,
		__scalarMin : null,
		__scalarMax : null,

		//THREE.js objects
		__scene : null,
		__camera : null,
		__renderer : null,
		__controls : null,

		__brightness : 0,
		__contrast : 1,

		__lookupTableRed : null,
		__lookupTableGreen : null,
		__lookupTableBlue : null,

		__texture : null,
		__material : null,

		getFileName : function () {
			return this.__file;
		},

		getDimensions : function () {
			return this.__dimensions;
		},

		getExtent : function () {
			return this.__extent;
		},

		getOrigin : function () {
			return this.__origin;
		},

		getSpacing : function () {
			return this.__spacing;
		},

		get2DSpacing : function () {
			var spacing=this.__spacing;
			switch (this.getOrientation())
			{
				default:
				case 0 :
					return [spacing[0], spacing[1]];
				case 1 :
					return [spacing[2], spacing[1]];
				case 2 :
					return [spacing[0], spacing[2]];
			}
		},

		getScalarType : function () {
			return this.__scalarType;
		},

		getScalarTypeAsString : function () {
			return this.__scalarTypeString;
		},

		getScalarSize : function () {
			return this.__scalarSize;
		},

		getScalarBounds : function () {
			return [this.__scalarMin, this.__scalarMax];
		},

		update : function () {
			var _this=this;
			if (this.__fileBrowser==null)
				alert ("error! no file browser was provided");
			else
			{
				function getAnswer(e)
					{
						var req = e.getTarget();
						var slicesDirectory=req.getResponseText().split("\n")[0];
						_this.openXMLURL(_this.__fileBrowser.getFileURL(slicesDirectory)+"/volume.xml");
					}

				var parameterMap={
					action : "slice_volume",
					input_volume : this.__file,
					output_directory : "cache\/",
					format : this.getImageFormat(),
					slice_orientation : this.getOrientation()};
				this.__fileBrowser.getActions().launchAction(parameterMap, getAnswer, this);
			}
		},

		getBrightness : function () {
			return this.__material.uniforms.brightness.value;
		},

		getContrast : function () {
			return this.__material.uniforms.contrast.value;
		},

		setBrightnessAndContrast : function (brightness, contrast)
		{
			this.__material.uniforms.brightness.value=brightness;
			this.__material.uniforms.contrast.value=contrast;
			this.fireEvent("changeImage");
		},

		setOpacity : function (opacity)
		{
			this.__material.uniforms.opacity.value=opacity;
			this.fireEvent("changeImage");
		},

		getSlicesIdOffset : function () {
			return this.__offset;
		},

		setLookupTables : function ( luts ) {
			this.__lookupTableRed=luts[0];
			this.__lookupTableGreen=luts[1];
			this.__lookupTableBlue=luts[2];

			var lookupTable=this.__material.uniforms.lookupTable.texture;
			var numberOfColors=luts[0].length;
			this.__material.uniforms.lookupTableLength.value=numberOfColors;
			this.__material.uniforms.useLookupTable.value=1;
			lookupTable.needsUpdate=true;
			var image=lookupTable.image;
			if (image.width!=numberOfColors) {
				image.data=new Uint8Array(numberOfColors*4);
				image.width=numberOfColors;
			}
			var data=image.data;
			var lutR=luts[0];
			var lutG=luts[1];
			var lutB=luts[2];
			var p=0;
			for (var i=0;i<numberOfColors;i++) {
				data[p++]=lutR[i];
				data[p++]=lutG[i];
				data[p++]=lutB[i];
				data[p++]=255;
			}
			this.fireEvent("changeImage");
		},

		getLookupTables : function () {
			return [this.__lookupTableRed, this.__lookupTableGreen, this.__lookupTableBlue];
		},

		removeLookupTables : function () {
			this.__lookupTableRed=null;
			this.__lookupTableGreen=null;
			this.__lookupTableBlue=null;
			this.__material.uniforms.useLookupTable.value=0;
			this.fireEvent("changeImage");
		},

		getMaterial : function (){
			return this.__material;
		},

		getCornersCoordinates : function () {
			switch (this.getOrientation())
			{
			// XY Z
			case 0 :
			default:
				var z=this.__origin[2]+(this.getSlice()+this.__extent[4])*this.__spacing[2];
				var xmin=this.__origin[0]+this.__extent[0]*this.__spacing[0];
				var xmax=this.__origin[0]+(this.__extent[1]+1)*this.__spacing[0];
				var ymin=this.__origin[1]+this.__extent[2]*this.__spacing[1];
				var ymax=this.__origin[1]+(this.__extent[3]+1)*this.__spacing[1];
				var coordinates=[];
				coordinates[0]=xmin;
				coordinates[1]=ymin;
				coordinates[2]=z;
				coordinates[3]=xmax;
				coordinates[4]=ymin;
				coordinates[5]=z;
				coordinates[6]=xmax;
				coordinates[7]=ymax;
				coordinates[8]=z;
				coordinates[9]=xmin;
				coordinates[10]=ymax;
				coordinates[11]=z;
				return (coordinates);
			// ZY X
			case 1 :
				var x=this.__origin[0]+(this.getSlice()+this.__extent[0])*this.__spacing[0];
				var ymin=this.__origin[2]+this.__extent[4]*this.__spacing[2];
				var ymax=this.__origin[2]+(this.__extent[5]+1)*this.__spacing[2];
				var zmin=this.__origin[1]+this.__extent[2]*this.__spacing[1];
				var zmax=this.__origin[1]+(this.__extent[3]+1)*this.__spacing[1];
				var coordinates=[];
				coordinates[0]=x;
				coordinates[1]=zmin;
				coordinates[2]=ymin;
				coordinates[3]=x;
				coordinates[4]=zmin;
				coordinates[5]=ymax;
				coordinates[6]=x;
				coordinates[7]=zmax;
				coordinates[8]=ymax;
				coordinates[9]=x;
				coordinates[10]=zmax;
				coordinates[11]=ymin;
				return (coordinates);
			// XZ Y
			case 2 :
				var y=this.__origin[1]+(this.getSlice()+this.__extent[2])*this.__spacing[1];
				var xmin=this.__origin[0]+this.__extent[0]*this.__spacing[0];
				var xmax=this.__origin[0]+(this.__extent[1]+1)*this.__spacing[0];
				var zmin=this.__origin[2]+this.__extent[4]*this.__spacing[2];
				var zmax=this.__origin[2]+(this.__extent[5]+1)*this.__spacing[2];
				var coordinates=[];
				coordinates[0]=xmin;
				coordinates[1]=y;
				coordinates[2]=zmin;
				coordinates[3]=xmax;
				coordinates[4]=y;
				coordinates[5]=zmin;
				coordinates[6]=xmax;
				coordinates[7]=y;
				coordinates[8]=zmax;
				coordinates[9]=xmin;
				coordinates[10]=y;
				coordinates[11]=zmax;
				return (coordinates);
			}
		},

		getBoundingBoxDiagonalLength : function () {
			var xmin=this.__origin[0]+this.__extent[0]*this.__spacing[0];
			var xmax=this.__origin[0]+(this.__extent[1]+1)*this.__spacing[0];
			var ymin=this.__origin[1]+this.__extent[2]*this.__spacing[1];
			var ymax=this.__origin[1]+(this.__extent[3]+1)*this.__spacing[1];
			var zmin=this.__origin[2]+this.__extent[4]*this.__spacing[2];
			var zmax=this.__origin[2]+(this.__extent[5]+1)*this.__spacing[2];
			return Math.sqrt((xmax-xmin)*(xmax-xmin)+
								(ymax-ymin)*(ymax-ymin)+
								(zmax-zmin)*(zmax-zmin));
		},

		get2DDimensions: function () {
			var dims=[];
			switch(this.getOrientation())
			{
				// ZY X
				case 1 :
					dims[0]=this.__dimensions[2];
					dims[1]=this.__dimensions[1];
					break;
				// XZ Y
				case 2 :
					dims[0]=this.__dimensions[0];
					dims[1]=this.__dimensions[2];
					break;
				// XY Z
				default :
					dims[0]=this.__dimensions[0];
					dims[1]=this.__dimensions[1];
			}
			return (dims);
		},

		get2DCornersCoordinates : function () {
			var xmin=this.__origin[0]+this.__extent[0]*this.__spacing[0];
			var xmax=this.__origin[0]+(this.__extent[1]+1)*this.__spacing[0];
			var ymin=this.__origin[1]+this.__extent[2]*this.__spacing[1];
			var ymax=this.__origin[1]+(this.__extent[3]+1)*this.__spacing[1];
			var zmin=this.__origin[2]+this.__extent[4]*this.__spacing[2];
			var zmax=this.__origin[2]+(this.__extent[5]+1)*this.__spacing[2];
			var coordinates=[];

			switch(this.getOrientation())
			{
				// ZY X
				case 1 :
					coordinates[0]=zmin;
					coordinates[1]=ymax;
					coordinates[2]=zmax;
					coordinates[3]=ymax;
					coordinates[4]=zmax;
					coordinates[5]=ymin;
					coordinates[6]=zmin;
					coordinates[7]=ymin;
					break;
				// XZ Y
				case 2 :
					coordinates[0]=xmin;
					coordinates[1]=zmax;
					coordinates[2]=xmax;
					coordinates[3]=zmax;
					coordinates[4]=xmax;
					coordinates[5]=zmin;
					coordinates[6]=xmin;
					coordinates[7]=zmin;
					break;
				// XY Z
				default :
					coordinates[0]=xmin;
					coordinates[1]=ymax;
					coordinates[2]=xmax;
					coordinates[3]=ymax;
					coordinates[4]=xmax;
					coordinates[5]=ymin;
					coordinates[6]=xmin;
					coordinates[7]=ymin;
			}
			return (coordinates);
		},

		getNumberOfSlices : function () {
			switch(this.getOrientation())
			{
				// ZY X
				case 1 :
					return this.__dimensions[0];
				// XZ Y
				case 2 :
					return this.__dimensions[1];
				// XY Z
				default :
					return this.__dimensions[2];
			}
		},

		openXMLURL : function (xmlURL) {

			var xmlhttp=new XMLHttpRequest();
			xmlhttp.open("GET",xmlURL+"?nocache=" + Math.random(),true);
			var _this=this;

			xmlhttp.onreadystatechange = function() {
				 if(this.readyState == 4 && this.status == 200)
				 {
					// so far so good
					if(xmlhttp.responseXML!=null)
					{
						var response = xmlhttp.responseXML;
						_this.__parseXMLresponse(response,xmlURL);
					}
					else
						alert("open volume slice : Failure...");
				}
				else if (xmlhttp.readyState == 4 && xmlhttp.status != 200)
				{
					// fetched the wrong page or network error...
					alert('open volume slice : "Fetched the wrong page" OR "Network error"');
				}
			}
			xmlhttp.send();
		},

		__parseXMLresponse : function (xmlDoc, xmlURL) {

			this.__availableImageFormat=this.getImageFormat();

			var volume=xmlDoc.getElementsByTagName("volume")[0];
			if (volume==null)
				return;

			// parse extent, dimensions, origin, spacing
			var XMLextent=volume.getElementsByTagName("extent")[0];
			this.__extent=new Array(parseInt(XMLextent.getAttribute("x1")),
							parseInt(XMLextent.getAttribute("x2")),
							parseInt(XMLextent.getAttribute("y1")),
							parseInt(XMLextent.getAttribute("y2")),
							parseInt(XMLextent.getAttribute("z1")),
							parseInt(XMLextent.getAttribute("z2")));

			var XMLdimensions=volume.getElementsByTagName("dimensions")[0];

			this.__dimensions=new Array(parseInt(XMLdimensions.getAttribute("x")),
							parseInt(XMLdimensions.getAttribute("y")),
							parseInt(XMLdimensions.getAttribute("z")));

			var XMLspacing=volume.getElementsByTagName("spacing")[0];
			this.__spacing=new Array(parseFloat(XMLspacing.getAttribute("x")),
							parseFloat(XMLspacing.getAttribute("y")),
							parseFloat(XMLspacing.getAttribute("z")));

			var XMLorigin=volume.getElementsByTagName("origin")[0];
			this.__origin=new Array(parseFloat(XMLorigin.getAttribute("x")),
							parseFloat(XMLorigin.getAttribute("y")),
							parseFloat(XMLorigin.getAttribute("z")));

			var XMLscalars=volume.getElementsByTagName("scalars")[0];
			this.__scalarType=parseInt(XMLscalars.getAttribute("type"),10);
			this.__scalarSize=parseInt(XMLscalars.getAttribute("size"),10);
			this.__scalarMin=parseFloat(XMLscalars.getAttribute("min"),10);
			this.__scalarMax=parseFloat(XMLscalars.getAttribute("max"),10);
			this.__scalarTypeString=XMLscalars.childNodes[0].nodeValue;;

			var slices=volume.getElementsByTagName("slicesprefix")[0];
			this.__offset=parseInt(slices.getAttribute("offset"));
			this.__timestamp=slices.getAttribute("timestamp");
			if (this.__timestamp==null)
				this.__timestamp=Math.random();
			this.__prefix=slices.childNodes[0].nodeValue;

			var slashIndex=xmlURL.lastIndexOf("/");
			this.__path="";
			if (slashIndex>0)
				this.__path=xmlURL.substring(0,slashIndex)+"\/";

			if (this.isReady()) {
				this.__updateTriggered=true;
				this.__updateImage();
			}
			else {
				this.setReady(true);
			}
		},

		__updateTriggered : true,
		__updateInProgress : false,

		__initChangeSliceTrigger : function () {
			this.addListener("changeSlice", function(){
				this.__updateTriggered=true;
				this.__updateImage();
			},this);

			var _this=this;
			this.__image.onload=function(){
				clearTimeout(this.__timeOut)
				_this.__updateInProgress=false;
				_this.__texture.needsUpdate = true;
				_this.fireEvent("changeImage");
				};
			this.__image.onerror=function(){
				_this.__updateTriggered=true;
				_this.__updateInProgress=false;
				_this.__updateImage();
				};
			this.__image.onabort=function(){
				_this.__updateTriggered=true;
				_this.__updateInProgress=false;
				_this.__updateImage();
				};
		},

		__timeOut : null,

		__updateImage : function () {
			if (this.__updateInProgress) {
				this.__updateTriggered=true;
				return;
			}
			if (this.__updateTriggered) {
				this.__timeOut=setTimeout(timeOut,5000);
				this.__reallyUpdateImage();
			}

			var _this=this;
			function timeOut () {
				_this.__updateInProgress=false;
				_this.__updateImage();
				
			}
		},

		__reallyUpdateImage : function() {
			var fileSuffix;
			if (this.__availableImageFormat==0) {
				fileSuffix=".png";
			}
			else {
				fileSuffix=".jpg";
			}

			var orientationString;
			switch(this.getOrientation())
			{
				// ZY X
				case 1 :
					orientationString="ZY";
					break;
				// XZ Y
				case 2 :
					orientationString="XZ";
					break;
				// XY Z
				default :
					orientationString="XY";
					break;
				}
			this.__updateInProgress=true;
			this.__updateTriggered=false;
			this.__image.src=this.__path+this.__prefix+orientationString+(this.__offset+this.getSlice())
				+fileSuffix+"?nocache="+this.__timestamp;
		}
	}
});
