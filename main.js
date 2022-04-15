let canvas = document.getElementById("main_canvas")

// themes
// "theme_name"_player
// "theme_name"_box
// "theme_name"_background
// "theme_name"_enemy_"number"

themes = {
	pikachu: {
		name: "pikachu",
		background: {
			color: "rgb(31.875, 31.875, 31.875)",
			image: function(ctx, width, height, scale) {ctx.globalAlpha = 0.5; let image = document.getElementById("pikachu_background"); image.onload = function() {ctx.drawImage(image, 0, 0, width, image.height, 0, 0, width, height)}}
		},
		player: {
			color: "magenta",
			background: "rgba(31.875, 31.875, 31.875, 0.3)",
			image: document.getElementById("pikachu_player")
		},
		block: {
			color: "red",
			background: "rgba(31.875, 31.875, 31.875, 0.3)",
			image: document.getElementById("pikachu_box")
		},
		font: {
			color: "white",
			style: "20px serif"
		},
		icons: {
			bonuses: {
				coin: document.getElementById("icon_coin"),
				diamond: document.getElementById("icon_diamond"),
				live: document.getElementById("icon_live"),
				non: document.getElementById("non")
			},
			live: document.getElementById("icon_live"),
			score: document.getElementById("pikachu_box"),
			record: document.getElementById("icon_record")
		},
		sounds: {
			coin: document.getElementById("sound_coin"),
			background: document.getElementById("sound_pikachu_background")
		}
	},

	hellokitty: {
		name: "hellokitty",
		background: {
			color: "rgb(31.875, 31.875, 31.875)",
			image: function(ctx, width, height, scale) {ctx.globalAlpha = 0.5; let image = document.getElementById("hellokitty_background"); image.onload = ctx.drawImage(image, 0, 0, width, image.height, 0, 0, width, height)}
		},
		player: {
			color: "magenta",
			background: "rgba(31.875, 31.875, 31.875, 0.3)",
			image: document.getElementById("hellokitty_player")
		},
		block: {
			color: "red",
			background: "rgba(31.875, 31.875, 31.875, 0.3)",
			image: document.getElementById("hellokitty_box")
		},
		font: {
			color: "rgb(100, 100, 100)",
			style: "20px serif"
		},
		icons: {
			bonuses: {
				coin: document.getElementById("icon_coin"),
				diamond: document.getElementById("icon_diamond"),
				live: document.getElementById("icon_live"),
				non: document.getElementById("non")
			},
			live: document.getElementById("icon_live"),
			score: document.getElementById("hellokitty_box"),
			record: document.getElementById("icon_record")
		},
		sounds: {
			coin: document.getElementById("sound_coin"),
			background: document.getElementById("sound_hellokitty_background")
		}
	},
	
	mickeymouse: {
		name: "mickeymouse",
		background: {
			color: "rgb(31.875, 31.875, 31.875)",
			image: function(ctx, width, height, scale) {ctx.globalAlpha = 0.5; let image = document.getElementById("mickeymouse_background"); image.onload = ctx.drawImage(image, 0, 0, width, image.height, 0, 0, width, height)}
		},
		player: {
			color: "magenta",
			background: "rgba(31.875, 31.875, 31.875, 0.3)",
			image: document.getElementById("mickeymouse_player")
		},
		block: {
			color: "red",
			background: "rgba(31.875, 31.875, 31.875, 0.3)",
			image: document.getElementById("mickeymouse_box")
		},
		font: {
			color: "white",
			style: "20px serif"
		},
		icons: {
			bonuses: {
				coin: document.getElementById("icon_coin"),
				diamond: document.getElementById("icon_diamond"),
				live: document.getElementById("icon_live"),
				non: document.getElementById("non")
			},
			live: document.getElementById("icon_live"),
			score: document.getElementById("mickeymouse_box"),
			record: document.getElementById("icon_record")
		},
		sounds: {
			coin: document.getElementById("sound_coin"),
			background: document.getElementById("sound_mickeymouse_background")
		}
	},

	sailormoon: {
		name: "sailormoon",
		background: {
			color: "rgb(31.875, 31.875, 31.875)",
			image: function(ctx, width, height, scale) {ctx.globalAlpha = 0.5; let image = document.getElementById("sailormoon_background"); image.onload = ctx.drawImage(image, 0, 0, width, image.height, 0, 0, width, height)}
		},
		player: {
			color: "magenta",
			background: "rgba(31.875, 31.875, 31.875, 0.3)",
			image: document.getElementById("sailormoon_player")
		},
		block: {
			color: "red",
			background: "rgba(31.875, 31.875, 31.875, 0.3)",
			image: document.getElementById("sailormoon_box")
		},
		font: {
			color: "white",
			style: "20px serif"
		},
		icons: {
			bonuses: {
				coin: document.getElementById("icon_coin"),
				diamond: document.getElementById("icon_diamond"),
				live: document.getElementById("icon_live"),
				non: document.getElementById("non")
			},
			live: document.getElementById("icon_live"),
			score: document.getElementById("sailormoon_box"),
			record: document.getElementById("icon_record")
		},
		sounds: {
			coin: document.getElementById("sound_coin"),
			background: document.getElementById("sound_sailormoon_background")
		}
	},
	
	spidermen: {
		name: "spidermen",
		background: {
			color: "rgb(31.875, 31.875, 31.875)",
			image: function(ctx, width, height, scale) {ctx.globalAlpha = 0.5; let image = document.getElementById("spidermen_background"); image.onload = function() {ctx.drawImage(image, 0, 0, width, image.height, 0, 0, width, height)}}
		},
		player: {
			color: "magenta",
			background: "rgba(31.875, 31.875, 31.875, 0.3)",
			image: document.getElementById("spidermen_player")
		},
		block: {
			color: "red",
			background: "rgba(31.875, 31.875, 31.875, 0.3)",
			image: document.getElementById("spidermen_box")
		},
		font: {
			color: "white",
			style: "20px serif"
		},
		icons: {
			bonuses: {
				coin: document.getElementById("icon_coin"),
				diamond: document.getElementById("icon_diamond"),
				live: document.getElementById("icon_live"),
				non: document.getElementById("non")
			},
			live: document.getElementById("icon_live"),
			score: document.getElementById("spidermen_box"),
			record: document.getElementById("icon_record")
		},
		sounds: {
			coin: document.getElementById("sound_coin"),
			background: document.getElementById("sound_spidermen_background")
		}
	},
	
	stich: {
		name: "stich",
		background: {
			image: function(ctx, width, height, scale) {ctx.globalAlpha = 1; let image = document.getElementById("stich_background"); image.onload = ctx.drawImage(image, 0, 0, width, image.height, 0, 0, width, height)}
		},
		player: {
			image: document.getElementById("stich_player")
		},
		block: {
			image: document.getElementById("stich_box")
		},
		font: {
			color: "white",
			style: "20px serif"
		},
		icons: {
			bonuses: {
				coin: document.getElementById("icon_coin"),
				diamond: document.getElementById("icon_diamond"),
				live: document.getElementById("icon_live"),
				non: document.getElementById("non")
			},
			live: document.getElementById("icon_live"),
			score: document.getElementById("stich_box"),
			record: document.getElementById("icon_record")
		},
		sounds: {
			coin: document.getElementById("sound_coin"),
			background: document.getElementById("sound_stich_background")
		}
	}
}


// main game class
class Game {
	constructor(mainloop, canvas, width, theme) {
		this.mainloop = mainloop
		this.settings.width = width
		this.theme = theme

		this.canvas = canvas
		this.ctx = canvas.getContext('2d')
		this.canvas.width = window.innerWidth
		this.canvas.height = window.innerHeight
		this.ctx.font = this.theme.font.style

		this.settings.scale = canvas.width / this.settings.width

		this.theme.background.image = renderBuf(this.canvas.width, this.canvas.height, this.theme.background.image, this.settings.scale)

		const font = new FontFace("publicpixel", "url(resources//fonts//publicpixel.ttf)")
		document.fonts.add(font)

		this.settings.font_size = (this.settings.scale / 4)
		this.ctx.font = this.settings.font_size.toString() + "px publicpixel"
		this.settings.icon_scale = this.settings.font_size

		this._blocks.length = Math.round((this.canvas.height / 4) / this.settings.scale)
		this._bonuses.length = this._blocks.length

		this.scores.coin = getCookie("dinoplat_coin")
		this.scores.diamond = getCookie("dinoplat_diamond")
		this.scores.record_score = getCookie("dinoplat_record_score")

// 		this.theme.sounds.background.volume = 0.1
	}

	over() {
		cancelAnimationFrame(this.recId)
		if (this.scores.score > this.scores.record_score) this.scores.record_score = this.scores.score
		this.scores.score = 0

		setCookie("dinoplat_record_score", this.scores.record_score.toString(), 30)
		setCookie("dinoplat_coin", this.scores.coin.toString(), 30)
		setCookie("dinoplat_diamond", this.scores.diamond.toString(), 30)

		// ~~~
		this.start()
	}

	start() {

		// this.theme.sounds.background.play()
		this.reqId = requestAnimationFrame(this.mainloop)
		for (let i = 0; i < this._blocks.length; ++i) {
			this._blocks[i] = []
			this._bonuses[i] = []

			this._bonuses[i][0] = "non"
			this._bonuses[i][3] = true
			this._blocks[i][1] = this.settings.scale * i * 4
			this._bonuses[i][2] = this.settings.scale * i * 4
		}

		this.settings.speed = 2.5
		this.player.x = random(1, this.settings.width - 2)
		this.player.lives = 3

	}

	step(dt) {
		this.recId = requestAnimationFrame(this.mainloop)

		if (this.player.lives <= 0) this.over()

		if (this.player.x > this.player.x2) this.player.x2 += 0.25
		if (this.player.x < this.player.x2) this.player.x2 -= 0.25

		for (let i = 0; i < this._blocks.length; ++i) {
			this._blocks[i][1] += dt / this.settings.speed + 1
			this._bonuses[i][2] += dt / this.settings.speed

			if (this._blocks[i][1] > this.canvas.height) {
				this._blocks[i][1] = this.settings.scale * -1
				this._blocks[i][0] = (this.settings.scale * random(0, this.settings.width - 1))
				this.scores.score++
			}

			if (this._bonuses[i][2] > this.canvas.height) {
				this._bonuses[i][2] = this.settings.scale * -1
				this._bonuses[i][3] = true
				this._bonuses[i][1] = (this.settings.scale * random(0, this.settings.width - 1))
				let prob = random(0, 100)
				this._bonuses[i][0] = this._bonuses_id[(prob <= this.probs.coin ? this._bonuses_id.indexOf("coin") : (prob <= 85 ? this._bonuses_id.indexOf("diamond") : (prob <= 87 ? this._bonuses_id.indexOf("live") : (0))))]
			}

			// collision
			if (this.settings.colision == true) {
				if (this._blocks[i][1] > (this.canvas.height - this.settings.scale * 2.9) && this._blocks[i][0] == this.player.x * this.settings.scale && this._blocks[i][1] < (this.canvas.height - this.settings.scale * 1.5)) {
					this.player.lives--
					this.player.x = (this.settings.width - 1) / 2
				}
				if (this._bonuses[i][2] > (this.canvas.height - this.settings.scale * 2.5) && this._bonuses[i][1] == this.player.x * this.settings.scale && this._bonuses[i][2] < (this.canvas.height - this.settings.scale * 1.5)) {
					if (this._bonuses[i][3] == true) {
						this._bonuses_funcs[this._bonuses[i][0]](this)
						this._bonuses[i][0] = "non"
						this._bonuses[i][3] = false
						this.theme.sounds.coin.play()
					}
				}
			}
		}

		if (this.settings.speed > this.settings.maxspeed) this.settings.speed -= 0.00005
	}
	
	render() {
		// full background
		this.ctx.drawImage(this.theme.background.image, 0, 0, this.canvas.width, this.canvas.height)

		// bonuses
		for (let i = 0; i < this._bonuses.length; ++i) {
			this.ctx.drawImage(this.theme.icons.bonuses[this._bonuses[i][0]], this._bonuses[i][1] + this.settings.icon_scale, this._bonuses[i][2] + this.settings.icon_scale, this.settings.icon_scale * 2, this.settings.icon_scale * 2)
		}

		// player
		this.ctx.fillStyle = this.theme.player.color
		this.ctx.drawImage(this.theme.player.image, (this.player.x2 * this.settings.scale), (this.canvas.height - this.settings.scale * 2), this.settings.scale, this.settings.scale)
		
		// blocks
		this.ctx.fillStyle = this.theme.block.color
		for (let i = 0; i < this._blocks.length; ++i) {
			this.ctx.drawImage(this.theme.block.image, this._blocks[i][0], this._blocks[i][1], this.settings.scale, this.settings.scale)
		}

		// score
		this.ctx.fillStyle = this.theme.font.color
		
		this.ctx.drawImage(this.theme.icons.score, 10, 10, this.settings.icon_scale, this.settings.icon_scale)
		this.ctx.fillText(":" + this.scores.score.toString(), this.settings.icon_scale + 10, 10 + this.settings.font_size)

		// record score
		this.ctx.drawImage(this.theme.icons.record, 10, 10 + this.settings.font_size + 10, this.settings.icon_scale, this.settings.icon_scale)
		this.ctx.fillText(":" + this.scores.record_score.toString(), this.settings.icon_scale + 10, 20 + this.settings.font_size * 2)

		// coins
		this.ctx.drawImage(this.theme.icons.bonuses.coin, this.canvas.width - (10 + this.settings.icon_scale), 10, this.settings.icon_scale, this.settings.icon_scale)
		this.ctx.fillText(this.scores.coin.toString(), this.canvas.width - (10 + this.settings.icon_scale + 10 + this.ctx.measureText(this.scores.coin.toString()).width), this.settings.font_size + 10)

		// diamonds
		this.ctx.drawImage(this.theme.icons.bonuses.diamond, this.canvas.width - (10 + this.settings.icon_scale), 10 + this.settings.icon_scale + 10, this.settings.icon_scale, this.settings.icon_scale)
		this.ctx.fillText(this.scores.diamond.toString(), this.canvas.width - (10 + this.settings.icon_scale + 10 + this.ctx.measureText(this.scores.diamond.toString()).width), this.settings.font_size * 2 + 20)

		// lives
		for (let i = 0; i < this.player.lives; ++i) {
			this.ctx.drawImage(this.theme.icons.live, i * this.settings.icon_scale + (this.canvas.width / 2 - (this.settings.icon_scale * this.player.lives / 2)), 10, this.settings.icon_scale, this.settings.icon_scale)
		}
	}

	player = {
		x: 0,
		x2: 0,
		lives: 3,
	}

	scores = {
		score: 0,
		record_score: 0,
		coin: 0,
		diamond: 0
	}

	settings = {
		speed: 2.5,
		maxspeed: 1,
		colision: true
	}

	probs = {
		diamond: 5,
		coin: 80,
		live: 2,
	}

	// system
	_blocks = []

	_bonuses = []
	_bonuses_funcs = {
		coin: function(gamec) {gamec.scores.coin++},
		diamond: function(gamec) {gamec.scores.diamond++},
		live: function(gamec) {if (gamec.player.lives < 5) {gamec.player.lives++}}
	}
	_bonuses_id = ["coin", "diamond", "live"]
}

// pikachu
// mickeymouse
// spidermen
// hellokitty
// sailormoon
// stich

let game = new Game(loop, canvas, 5, themes[getGet("theme")])
let time

// main block

function loop() {
	let now = new Date().getTime(),
		dt = now - (time || now)

	time = now

	game.step(dt)
	game.render()
}

// system functions

function random(min, max) {
	min = Math.ceil(min)
	max = Math.floor(max)
	return Math.floor(Math.random() * (max - min + 1)) + min
}

function random_prob(arr) {
	let rn = random(0, 100)
}

function renderBuf(width, height, render, scale) {
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	render(canvas.getContext('2d'), width, height, scale)
	return canvas
}

function setCookie(name, val, expires) {
	var date = new Date
	date.setDate(date.getDate() + expires)
	document.cookie = name+"="+val+"; path=/; expires=" + date.toUTCString()
}

function getCookie(name) {
	var matches = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"))
	return matches ? decodeURIComponent(matches[1]) : 0
}

function getGet(name) {
    var s = window.location.search;
    s = s.match(new RegExp(name + '=([^&=]+)'));
    return s ? s[1] : false;
}

// event handler

document.addEventListener("touchstart", touchHandler, true)
document.addEventListener("touchend", touchHandler, true)
document.addEventListener("touchcancel", touchHandler, true)

function touchHandler(event) {
	event.preventDefault()
	let touches = event.changedTouches,
		first = touches[0],
		type = ""
	switch (event.type) {
		case "touchstart":
			type = "mousedown"
			break
		case "touchend":
			type = "mouseup"
			break
		default:
			return
	}
	let simulatedEvent = document.createEvent("MouseEvent")
	simulatedEvent.initMouseEvent(type, true, true, window, 1, first.screenX, first.screenY, first.clientX, first.clientY, false, false, false, false, 0, null)
	first.target.dispatchEvent(simulatedEvent)
}

document.addEventListener('mousedown', (event) => {
	game.theme.sounds.background.autoplay = true
	game.theme.sounds.background.play()
	if (event.x > document.documentElement.clientWidth / 2) {
		if (game.player.x < game.settings.width - 1) ++game.player.x
	} else {
		if (game.player.x > 0) --game.player.x
	}
})

document.onmousedown = document.onselectstart = function() {
	return false
}


// ~~~~~~~~~
game.start()
