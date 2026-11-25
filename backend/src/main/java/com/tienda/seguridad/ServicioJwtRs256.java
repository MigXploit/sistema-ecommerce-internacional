package com.tienda.seguridad;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Proveedor criptográfico de tokens JWT con firma asimétrica RS256 (RSA-2048)
 * y control estricto de expiración por inactividad de 15 minutos (RNF01, Sección 10.2).
 */
@Component
public class ServicioJwtRs256 {

    private final KeyPair rsaKeyPair;
    private final ObjectMapper mapper = new ObjectMapper();
    private final Map<String, Instant> ultimaActividadPorToken = new ConcurrentHashMap<>();

    @Value("${app.seguridad.inactividad-minutos:15}")
    private long inactividadMinutos;

    public ServicioJwtRs256() {
        try {
            KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
            kpg.initialize(2048);
            this.rsaKeyPair = kpg.generateKeyPair();
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo inicializar el par de llaves RSA-2048 para JWT RS256", e);
        }
    }

    public record SesionToken(
            Integer idSujeto,
            String identificador,
            String nombre,
            String tipoCuenta, // INTERNO o CLIENTE
            String rol          // RolUsuario o CLIENTE
    ) {}

    public String emitirToken(SesionToken sesion) {
        try {
            long ahora = Instant.now().getEpochSecond();
            long exp = ahora + (8 * 3600); // Vigencia máxima absoluta 8h, sujeta a cierre por 15 min de inactividad

            Map<String, Object> header = Map.of("alg", "RS256", "typ", "JWT");
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("sub", sesion.identificador());
            payload.put("uid", sesion.idSujeto());
            payload.put("name", sesion.nombre());
            payload.put("kind", sesion.tipoCuenta());
            payload.put("role", sesion.rol());
            payload.put("iat", ahora);
            payload.put("exp", exp);

            String hB64 = b64Url(mapper.writeValueAsBytes(header));
            String pB64 = b64Url(mapper.writeValueAsBytes(payload));
            String signingInput = hB64 + "." + pB64;

            Signature sig = Signature.getInstance("SHA256withRSA");
            sig.initSign(rsaKeyPair.getPrivate());
            sig.update(signingInput.getBytes(StandardCharsets.UTF_8));
            String sB64 = b64Url(sig.sign());

            String jwt = signingInput + "." + sB64;
            ultimaActividadPorToken.put(sB64, Instant.now());
            return jwt;
        } catch (Exception e) {
            throw new IllegalStateException("Error firmando JWT RS256", e);
        }
    }

    @SuppressWarnings("unchecked")
    public SesionToken validarYRenovarActividad(String jwt) {
        try {
            String[] partes = jwt.split("\\.");
            if (partes.length != 3) return null;

            String signingInput = partes[0] + "." + partes[1];
            byte[] firma = Base64.getUrlDecoder().decode(partes[2]);

            Signature verifier = Signature.getInstance("SHA256withRSA");
            verifier.initVerify(rsaKeyPair.getPublic());
            verifier.update(signingInput.getBytes(StandardCharsets.UTF_8));
            if (!verifier.verify(firma)) {
                return null;
            }

            Map<String, Object> payload = mapper.readValue(Base64.getUrlDecoder().decode(partes[1]), Map.class);
            long exp = ((Number) payload.get("exp")).longValue();
            if (Instant.now().getEpochSecond() > exp) {
                return null;
            }

            // RNF01: Cierre automático de sesión tras 15 minutos de inactividad
            Instant ultima = ultimaActividadPorToken.get(partes[2]);
            if (ultima != null && Instant.now().isAfter(ultima.plusSeconds(inactividadMinutos * 60))) {
                ultimaActividadPorToken.remove(partes[2]);
                return null;
            }
            ultimaActividadPorToken.put(partes[2], Instant.now());

            return new SesionToken(
                    ((Number) payload.get("uid")).intValue(),
                    (String) payload.get("sub"),
                    (String) payload.get("name"),
                    (String) payload.get("kind"),
                    (String) payload.get("role")
            );
        } catch (Exception e) {
            return null;
        }
    }

    public void invalidarToken(String jwt) {
        if (jwt != null) {
            String[] partes = jwt.split("\\.");
            if (partes.length == 3) {
                ultimaActividadPorToken.remove(partes[2]);
            }
        }
    }

    private String b64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
