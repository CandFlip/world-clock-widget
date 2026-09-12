package com.candflip.worldclockalarm;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONArray;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class Store {
    private static final String PREF="world_clock_alarm", ALIAS="world_clock_alarm_credential";
    private final SharedPreferences prefs;
    Store(Context c){ prefs=c.getSharedPreferences(PREF,Context.MODE_PRIVATE); }

    String credential(){
        String value=prefs.getString("credential",""); if(value.isEmpty()) return "";
        try { byte[] raw=Base64.decode(value,Base64.NO_WRAP),iv=new byte[12]; System.arraycopy(raw,0,iv,0,12);
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,iv));
            return new String(cipher.doFinal(raw,12,raw.length-12),StandardCharsets.UTF_8);
        } catch(Exception e){ return ""; }
    }
    void credential(String value){
        try { Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE,key());
            byte[] encrypted=cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)),iv=cipher.getIV(),raw=new byte[iv.length+encrypted.length];
            System.arraycopy(iv,0,raw,0,iv.length); System.arraycopy(encrypted,0,raw,iv.length,encrypted.length);
            prefs.edit().putString("credential",Base64.encodeToString(raw,Base64.NO_WRAP)).apply();
        } catch(Exception e){ throw new IllegalStateException(e); }
    }
    private SecretKey key() throws Exception {
        KeyStore ks=KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if(ks.containsAlias(ALIAS)) return (SecretKey)ks.getKey(ALIAS,null);
        KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        gen.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return gen.generateKey();
    }
    String state(){ return prefs.getString("state","{\"reminders\":[]}"); }
    void state(String value){ prefs.edit().putString("state",value).apply(); }
    long revision(){ return prefs.getLong("revision",0); }
    void revision(long value){ prefs.edit().putLong("revision",value).apply(); }
    void connectedName(String value){ prefs.edit().putString("connected_name",value).apply(); }
    String connectedName(){ return prefs.getString("connected_name",""); }
    void clear(){ prefs.edit().clear().apply(); }
    JSONArray pendingActions(){ try{return new JSONArray(prefs.getString("actions","[]"));}catch(Exception e){return new JSONArray();} }
    void pendingActions(JSONArray value){ prefs.edit().putString("actions",value.toString()).apply(); }
}
