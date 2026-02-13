#!/usr/bin/env node

/**
 * Script de configuración de Supabase Storage
 * Ejecutar: node setup-storage.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: Faltan variables de entorno');
  console.error('Asegúrate de tener SUPABASE_URL y SUPABASE_SERVICE_KEY en tu .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupStorage() {
  console.log('🚀 Configurando Supabase Storage...\n');

  try {
    // 1. Verificar si el bucket ya existe
    console.log('1️⃣ Verificando bucket existente...');
    const { data: buckets } = await supabase.storage.listBuckets();
    const existingBucket = buckets?.find(b => b.name === 'avatars');

    if (existingBucket) {
      console.log('✅ El bucket "avatars" ya existe\n');
    } else {
      // 2. Crear bucket
      console.log('2️⃣ Creando bucket "avatars"...');
      const { data: bucket, error: bucketError } = await supabase.storage.createBucket('avatars', {
        public: true,
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: [
          'image/png',
          'image/jpeg',
          'image/jpg',
          'image/gif',
          'image/webp'
        ]
      });

      if (bucketError) {
        console.error('❌ Error creando bucket:', bucketError.message);
        throw bucketError;
      }

      console.log('✅ Bucket creado correctamente\n');
    }

    // 3. Información del bucket
    console.log('📊 Configuración del bucket:');
    console.log('   - Nombre: avatars');
    console.log('   - Público: Sí');
    console.log('   - Tamaño máximo: 5MB');
    console.log('   - Tipos permitidos: PNG, JPEG, JPG, GIF, WEBP\n');

    // 4. Crear carpetas de ejemplo
    console.log('3️⃣ Creando estructura de carpetas...');
    
    // Crear un archivo temporal para crear las carpetas
    const dummyFile = Buffer.from('');
    
    await supabase.storage
      .from('avatars')
      .upload('avatars/.keep', dummyFile, { upsert: true });
    
    await supabase.storage
      .from('avatars')
      .upload('banners/.keep', dummyFile, { upsert: true });

    console.log('✅ Carpetas creadas: avatars/ y banners/\n');

    console.log('═══════════════════════════════════════');
    console.log('✨ ¡Configuración completada!\n');
    console.log('Próximos pasos:');
    console.log('1. Copia SUPABASE_URL y SUPABASE_KEY a Render');
    console.log('2. Asegúrate de tener DATABASE_URL configurado');
    console.log('3. Reinicia tu aplicación en Render\n');
    console.log('📝 URL del bucket:');
    console.log(`   ${supabaseUrl}/storage/v1/object/public/avatars/`);
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error en la configuración:', error.message);
    process.exit(1);
  }
}

setupStorage();