// An INVENTED official site (WordPress REST API) for the real-site build's tests (scripts/real-site). Every text is made
// up and marked (demo); the host sitio-oficial.test does not exist. A module, not a .json file: the server's file tracing
// ships every .json of the project (a read of «<path>.json» in src/lib/storage/demo-store.ts), and test data has no place
// in a deployment.
type Post = { id: number; categories: number[]; [field: string]: unknown };
type Media = { id: number; [field: string]: unknown };

export const WP: { root: Record<string, unknown>; categories: Record<string, unknown>[]; news: Post[]; opinion: Post[]; pages: Post[]; media: Media[] } = {
  "root": {
    "name": "Persona Demo  Persona Demo - Gobernadora de prueba (demo)",
    "description": ""
  },
  "categories": [
    {
      "id": 11,
      "slug": "tachira",
      "name": "Región (demo)",
      "link": "https://sitio-oficial.test/categoria/tachira/",
      "count": 3
    },
    {
      "id": 12,
      "slug": "nacionales",
      "name": "Nacionales (demo)",
      "link": "https://sitio-oficial.test/categoria/nacionales/",
      "count": 1
    },
    {
      "id": 13,
      "slug": "opinion",
      "name": "Opinión (demo)",
      "link": "https://sitio-oficial.test/categoria/opinion/",
      "count": 1
    },
    {
      "id": 14,
      "slug": "biografia",
      "name": "BIOGRAFÍA (demo)",
      "link": "https://sitio-oficial.test/categoria/biografia/",
      "count": 1
    },
    {
      "id": 15,
      "slug": "informativo",
      "name": "el informativo (demo)",
      "link": "https://sitio-oficial.test/categoria/informativo/",
      "count": 1
    }
  ],
  "news": [
    {
      "id": 9101,
      "date": "2026-10-30T09:00:00",
      "date_gmt": "2026-10-30T13:00:00",
      "modified": "2026-10-30T09:00:00",
      "modified_gmt": "2026-10-30T13:00:00",
      "slug": "inauguran-cancha-deportiva-demo",
      "status": "publish",
      "type": "post",
      "link": "https://sitio-oficial.test/2026/10/inauguran-cancha-deportiva-demo/",
      "title": {
        "rendered": "Inauguran cancha deportiva en el sector de prueba (demo)"
      },
      "content": {
        "rendered": "<p>El gobierno regional inauguró una cancha deportiva en el sector de prueba (demo). La obra beneficia a vecinos inventados.</p>\n<p>Para inscribirse en los torneos, escribir a inscripciones.demo@correo.test antes del viernes. La cancha abre todos los días (demo).</p>\n<figure class=\"wp-block-image\"><img class=\"wp-image-7002\" src=\"https://sitio-oficial.test/wp-content/uploads/2026/10/cancha-2.jpg\" alt=\"\"></figure>\n<p><img class=\"size-medium wp-image-7003\" src=\"https://sitio-oficial.test/wp-content/uploads/2026/10/cancha-3-300x225.jpg\" alt=\"\"></p>\n<p><img src=\"https://sitio-oficial.test/wp-content/uploads/2026/10/cancha-4.jpg\" alt=\"Cuarta foto (demo)\"></p>\n<p><img src=\"https://otro-sitio.test/ajena.jpg\" alt=\"De otra página (demo)\"></p>"
      },
      "excerpt": {
        "rendered": ""
      },
      "author": 3,
      "featured_media": 7001,
      "categories": [
        11
      ],
      "tags": [],
      "yoast_head_json": {
        "author": "Usuario Demo",
        "description": "Una cancha deportiva inventada para las pruebas (demo)."
      }
    },
    {
      "id": 9102,
      "date": "2026-10-29T10:00:00",
      "date_gmt": "2026-10-29T14:00:00",
      "modified": "2026-10-29T10:00:00",
      "modified_gmt": "2026-10-29T14:00:00",
      "slug": "jornada-con-telefono-demo",
      "status": "publish",
      "type": "post",
      "link": "https://sitio-oficial.test/2026/10/jornada-con-telefono-demo/",
      "title": {
        "rendered": "Llame al 0414-555-0101 para la jornada (demo)"
      },
      "content": {
        "rendered": "<p>Texto inventado de la jornada (demo).</p>"
      },
      "excerpt": {
        "rendered": ""
      },
      "author": 3,
      "featured_media": 0,
      "categories": [
        11
      ],
      "tags": []
    },
    {
      "id": 9103,
      "date": "2026-10-28T08:30:00",
      "date_gmt": "2026-10-28T12:30:00",
      "modified": "2026-10-28T08:30:00",
      "modified_gmt": "2026-10-28T12:30:00",
      "slug": "jornada-de-vacunacion-demo",
      "status": "publish",
      "type": "post",
      "link": "https://sitio-oficial.test/2026/10/jornada-de-vacunacion-demo/",
      "title": {
        "rendered": "Jornada de vacunación en el municipio de prueba (demo)"
      },
      "content": {
        "rendered": "<h2>Jornada de vacunación en el municipio de prueba (demo)</h2>\n<p>Más de 3 mil personas inventadas recibieron su dosis (demo). El Dr. Prueba explicó el plan del día.</p>\n<p><img class=\"wp-image-7005\" src=\"https://sitio-oficial.test/wp-content/uploads/2026/10/vacuna-2.png\" alt=\"\"></p>"
      },
      "excerpt": {
        "rendered": "<p>Una jornada inventada de vacunación para las pruebas (demo).</p>"
      },
      "author": 3,
      "featured_media": 7004,
      "categories": [
        12
      ],
      "tags": []
    },
    {
      "id": 9104,
      "date": "2026-10-27T15:00:00",
      "date_gmt": "2026-10-27T19:00:00",
      "modified": "2026-10-27T15:00:00",
      "modified_gmt": "2026-10-27T19:00:00",
      "slug": "inauguran-cancha-deportiva-d%C3%A9mo",
      "status": "publish",
      "type": "post",
      "link": "https://sitio-oficial.test/2026/10/inauguran-cancha-deportiva-d%C3%A9mo/",
      "title": {
        "rendered": "Nota sin fotos para las pruebas (demo)"
      },
      "content": {
        "rendered": "<p>Una nota inventada sin ninguna foto (demo).</p>\n<blockquote><p>Una cita inventada (demo).</p><cite>Vocera Demo, teléfono 0414-555-0102</cite></blockquote>"
      },
      "excerpt": {
        "rendered": ""
      },
      "author": 3,
      "featured_media": 0,
      "categories": [
        11
      ],
      "tags": []
    }
  ],
  "opinion": [
    {
      "id": 9201,
      "date": "2026-10-26T07:00:00",
      "date_gmt": "2026-10-26T11:00:00",
      "modified": "2026-10-26T07:00:00",
      "modified_gmt": "2026-10-26T11:00:00",
      "slug": "columna-de-prueba-demo",
      "status": "publish",
      "type": "post",
      "link": "https://sitio-oficial.test/2026/10/columna-de-prueba-demo/",
      "title": {
        "rendered": "Columna de opinión de prueba (demo)"
      },
      "content": {
        "rendered": "<p>Texto de una columna inventada (demo).</p><p><em>Columnista Demo</em></p>"
      },
      "excerpt": {
        "rendered": ""
      },
      "author": 3,
      "featured_media": 0,
      "categories": [
        13
      ],
      "tags": []
    }
  ],
  "pages": [
    {
      "id": 9301,
      "date": "2013-03-09T10:20:00",
      "date_gmt": "2013-03-09T10:20:00",
      "modified": "2013-03-09T10:20:00",
      "modified_gmt": "2013-03-09T10:20:00",
      "slug": "biografia",
      "status": "publish",
      "type": "post",
      "link": "https://sitio-oficial.test/2013/03/biografia/",
      "title": {
        "rendered": "Biografía"
      },
      "content": {
        "rendered": "<header><h1 class=\"entry-title\"></h1></header>\n<div class=\"entry-content\"><p>Persona Demo nace en una ciudad de prueba el 1 de enero de 1970 (demo). Estudió en una escuela inventada.</p>\n<p>Fue alcaldesa de un municipio de prueba entre 2000 y 2008 (demo). Actualmente es miembro de una comisión inventada. Presidió una asociación de prueba (demo). Su correo era bio.demo@correo.test para las consultas.</p>\n<p>Condecoraciones</p>\n<p>&#8211; Orden de Prueba, clase única (demo).</p>\n<p>-Orden Inventada, Municipio Demo.</p>\n<p>Distinciones locales</p>\n<p>&#8211; Ciudad de Prueba (demo)</p>\n<p>&#8211; Ciudad Inventada (demo)</p></div>"
      },
      "excerpt": {
        "rendered": ""
      },
      "author": 3,
      "featured_media": 0,
      "categories": [
        14
      ],
      "tags": []
    },
    {
      "id": 9401,
      "date": "2021-12-02T11:05:00",
      "date_gmt": "2021-12-02T15:05:00",
      "modified": "2021-12-02T11:05:00",
      "modified_gmt": "2021-12-02T15:05:00",
      "slug": "persona-demo-gana-la-eleccion-de-prueba",
      "status": "publish",
      "type": "post",
      "link": "https://sitio-oficial.test/2021/12/persona-demo-gana-la-eleccion-de-prueba/",
      "title": {
        "rendered": "Persona Demo recibe la credencial de prueba (demo)"
      },
      "content": {
        "rendered": "<p>Sumario inventado de la elección de prueba (demo)</p>\n<h3><strong>Persona Demo recibe la credencial de prueba (demo)</strong></h3>\n<p><strong>En un acto de prueba</strong>, un consejo inventado entregó a Persona Demo su credencial de la elección de prueba (demo).</p>\n<p>Otro párrafo que no va (demo).</p>"
      },
      "excerpt": {
        "rendered": ""
      },
      "author": 3,
      "featured_media": 0,
      "categories": [
        11
      ],
      "tags": []
    },
    {
      "id": 9402,
      "date": "2025-07-10T09:41:00",
      "date_gmt": "2025-07-10T13:41:00",
      "modified": "2025-07-10T09:41:00",
      "modified_gmt": "2025-07-10T13:41:00",
      "slug": "persona-demo-asume-de-nuevo",
      "status": "publish",
      "type": "post",
      "link": "https://sitio-oficial.test/2025/07/persona-demo-asume-de-nuevo/",
      "title": {
        "rendered": "Persona Demo asume de nuevo (demo)"
      },
      "content": {
        "rendered": "<p>Persona Demo comenzó un período de prueba en un acto inventado (demo).</p>"
      },
      "excerpt": {
        "rendered": ""
      },
      "author": 3,
      "featured_media": 0,
      "categories": [
        11
      ],
      "tags": []
    }
  ],
  "media": [
    {
      "id": 7001,
      "source_url": "https://sitio-oficial.test/wp-content/uploads/2026/10/cancha.jpg",
      "mime_type": "image/jpeg",
      "media_type": "image",
      "alt_text": "",
      "caption": {
        "rendered": ""
      },
      "media_details": {
        "width": 2000,
        "height": 1334,
        "sizes": {
          "large": {
            "source_url": "https://sitio-oficial.test/wp-content/uploads/2026/10/cancha-1024x683.jpg",
            "width": 1024,
            "height": 683
          },
          "thumbnail": {
            "source_url": "https://sitio-oficial.test/wp-content/uploads/2026/10/cancha-150x150.jpg",
            "width": 150,
            "height": 150
          }
        }
      }
    },
    {
      "id": 7002,
      "source_url": "https://sitio-oficial.test/wp-content/uploads/2026/10/cancha-2.jpg",
      "alt_text": "Vecinos inventados en la cancha (demo)",
      "caption": {
        "rendered": ""
      },
      "media_details": {
        "width": 640,
        "height": 427
      }
    },
    {
      "id": 7003,
      "source_url": "https://sitio-oficial.test/wp-content/uploads/2026/10/cancha-3.jpg",
      "alt_text": "photo_0000000000000000000_y",
      "caption": {
        "rendered": "<p>Partido inaugural de prueba (demo)</p>"
      },
      "media_details": {
        "width": 640,
        "height": 480
      }
    },
    {
      "id": 7004,
      "source_url": "https://sitio-oficial.test/wp-content/uploads/2026/10/vacuna.avif",
      "alt_text": "",
      "caption": {
        "rendered": ""
      },
      "media_details": {
        "width": 1200,
        "height": 800
      }
    },
    {
      "id": 7005,
      "source_url": "https://sitio-oficial.test/wp-content/uploads/2026/10/vacuna-2.png",
      "alt_text": "",
      "caption": {
        "rendered": ""
      },
      "media_details": {
        "width": 640,
        "height": 480
      }
    },
    {
      "id": 7101,
      "source_url": "https://sitio-oficial.test/wp-content/uploads/2022/05/retrato-portada.jpg",
      "alt_text": "",
      "caption": {
        "rendered": ""
      },
      "media_details": {
        "width": 1200,
        "height": 675
      }
    },
    {
      "id": 7102,
      "source_url": "https://sitio-oficial.test/wp-content/uploads/2025/07/retrato.jpg",
      "alt_text": "",
      "caption": {
        "rendered": ""
      },
      "media_details": {
        "width": 640,
        "height": 800
      }
    },
    {
      "id": 7201,
      "source_url": "https://sitio-oficial.test/wp-content/uploads/2026/09/portada-semanario.jpg",
      "alt_text": "",
      "caption": {
        "rendered": ""
      },
      "media_details": {
        "width": 480,
        "height": 640
      }
    }
  ]
};
